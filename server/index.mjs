import express from 'express';
import dotenv from 'dotenv';
import { checkSignature } from '@meshsdk/core';
import * as coreCst from '@meshsdk/core-cst';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8787);
const INDEX_TTL_MS = Number(process.env.INDEX_TTL_MS || 30_000);

const NETWORKS = {
  mainnet: {
    baseUrl: 'https://cardano-mainnet.blockfrost.io/api/v0',
    key: process.env.BLOCKFROST_MAINNET_PROJECT_ID || '',
  },
  testnet: {
    // Blockfrost currently serves "testnet" through the preview endpoint in this app.
    baseUrl: 'https://cardano-preview.blockfrost.io/api/v0',
    key: process.env.BLOCKFROST_TESTNET_PROJECT_ID || process.env.BLOCKFROST_PROJECT_ID || '',
  },
};

const indexCache = {
  mainnet: { at: 0, surveys: [], responsesBySurvey: new Map() },
  testnet: { at: 0, surveys: [], responsesBySurvey: new Map() },
};

function normalizeNetwork(value) {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function pickNetwork(req) {
  const q = typeof req.query?.network === 'string' ? req.query.network : '';
  const h = typeof req.headers['x-network'] === 'string' ? req.headers['x-network'] : '';
  return normalizeNetwork((q || h || 'mainnet').toLowerCase());
}

function getNetworkConfig(network) {
  const cfg = NETWORKS[normalizeNetwork(network)];
  if (!cfg.key) {
    const label = cfg === NETWORKS.mainnet ? 'mainnet' : 'testnet';
    throw new Error(`Missing Blockfrost key for ${label}. Set BLOCKFROST_${label.toUpperCase()}_PROJECT_ID in server .env.`);
  }
  return cfg;
}

async function blockfrostFetch(network, path, init = {}) {
  const cfg = getNetworkConfig(network);
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      project_id: cfg.key,
      ...(init.headers || {}),
    },
  });
  return res;
}

async function blockfrostJson(network, path) {
  const res = await blockfrostFetch(network, path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Blockfrost ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchLabel17Entries(network) {
  const all = [];
  let page = 1;
  const count = 100;
  while (true) {
    const entries = await blockfrostJson(network, `/metadata/txs/labels/17?page=${page}&count=${count}`);
    if (!Array.isArray(entries) || entries.length === 0) break;
    all.push(...entries);
    if (entries.length < count) break;
    page += 1;
  }
  return all;
}

async function buildIndex(network) {
  const now = Date.now();
  const cached = indexCache[network];
  if (cached.at > 0 && now - cached.at < INDEX_TTL_MS) return cached;

  const entries = await fetchLabel17Entries(network);
  const txCache = new Map();
  const utxoCache = new Map();
  const surveys = [];
  const responsesBySurvey = new Map();

  for (const entry of entries) {
    const meta = entry?.json_metadata;
    if (!meta || typeof meta !== 'object') continue;
    const txHash = entry.tx_hash;
    if (!txHash) continue;

    if (!txCache.has(txHash)) {
      const txInfo = await blockfrostJson(network, `/txs/${txHash}`);
      txCache.set(txHash, txInfo);
    }
    const txInfo = txCache.get(txHash);

    if ('surveyDetails' in meta) {
      surveys.push({
        tx_hash: txHash,
        json_metadata: meta,
        slot: txInfo?.slot,
        index: txInfo?.index,
        block_time: txInfo?.block_time,
      });
      continue;
    }

    if ('surveyResponse' in meta) {
      const surveyTxId = meta?.surveyResponse?.surveyTxId;
      if (typeof surveyTxId !== 'string') continue;
      if (!utxoCache.has(txHash)) {
        try {
          const utxoInfo = await blockfrostJson(network, `/txs/${txHash}/utxos`);
          utxoCache.set(txHash, utxoInfo);
        } catch {
          utxoCache.set(txHash, null);
        }
      }
      const utxoInfo = utxoCache.get(txHash);
      const inputAddress = utxoInfo?.inputs?.[0]?.address;
      const arr = responsesBySurvey.get(surveyTxId) ?? [];
      arr.push({
        tx_hash: txHash,
        json_metadata: meta,
        slot: txInfo?.slot,
        index: txInfo?.index,
        block_time: txInfo?.block_time,
        input_address: inputAddress,
      });
      responsesBySurvey.set(surveyTxId, arr);
    }
  }

  surveys.sort((a, b) => (b.slot ?? 0) - (a.slot ?? 0));
  for (const [surveyTxId, list] of responsesBySurvey.entries()) {
    list.sort((a, b) => {
      const slotDiff = (b.slot ?? 0) - (a.slot ?? 0);
      if (slotDiff !== 0) return slotDiff;
      return (b.index ?? 0) - (a.index ?? 0);
    });
    responsesBySurvey.set(surveyTxId, list);
  }

  const next = { at: now, surveys, responsesBySurvey };
  indexCache[network] = next;
  return next;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keys: {
      mainnet: Boolean(NETWORKS.mainnet.key),
      testnet: Boolean(NETWORKS.testnet.key),
    },
    ts: Date.now(),
  });
});

app.get('/api/index/surveys', async (req, res) => {
  try {
    const network = pickNetwork(req);
    const index = await buildIndex(network);
    res.json({
      network,
      cachedAt: index.at,
      count: index.surveys.length,
      surveys: index.surveys,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Index error' });
  }
});

app.get('/api/index/responses/:surveyTxId', async (req, res) => {
  try {
    const network = pickNetwork(req);
    const sinceSlot = Number(req.query?.sinceSlot ?? 0);
    const index = await buildIndex(network);
    const base = index.responsesBySurvey.get(req.params.surveyTxId) ?? [];
    const filtered = sinceSlot > 0 ? base.filter((r) => Number(r.slot ?? 0) > sinceSlot) : base;
    res.json({
      network,
      cachedAt: index.at,
      surveyTxId: req.params.surveyTxId,
      count: filtered.length,
      responses: filtered,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Index error' });
  }
});

app.use(express.json({ limit: '1mb' }));
app.post('/api/proof/validate', async (req, res) => {
  try {
    const network = normalizeNetwork(req.body?.network);
    const claimedDrepId = typeof req.body?.claimedDrepId === 'string' ? req.body.claimedDrepId.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    const signature = typeof req.body?.signature === 'string' ? req.body.signature.trim() : '';
    if (!claimedDrepId || !message || !key || !signature) {
      res.status(400).json({ ok: false, reason: 'Missing one or more fields (claimedDrepId, message, key, signature).' });
      return;
    }

    const signatureOk = await checkSignature(message, { key, signature });
    if (!signatureOk) {
      res.json({ ok: false, reason: 'Invalid signature.' });
      return;
    }

    let derived = { cip105: undefined, cip129: undefined };
    try {
      const pubKeyBytes = coreCst.getPublicKeyFromCoseKey(key);
      const pubKeyHex = Array.from(pubKeyBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      derived = coreCst.getDRepIds(pubKeyHex);
    } catch {
      res.json({ ok: false, reason: 'Could not derive DRep IDs from key.' });
      return;
    }

    if (derived.cip105 !== claimedDrepId && derived.cip129 !== claimedDrepId) {
      res.json({ ok: false, reason: 'Derived DRep IDs do not match claimed DRep ID.', derived });
      return;
    }

    const drepRes = await blockfrostFetch(network, `/governance/dreps/${claimedDrepId}`);
    if (!drepRes.ok) {
      res.json({ ok: false, reason: 'Claimed DRep ID not found on-chain.' });
      return;
    }
    const drepInfo = await drepRes.json();
    if (drepInfo?.retired) {
      res.json({ ok: false, reason: 'Claimed DRep is retired on-chain.' });
      return;
    }

    res.json({ ok: true, derived, drep: { id: claimedDrepId, retired: false } });
  } catch (err) {
    res.status(500).json({ ok: false, reason: err instanceof Error ? err.message : 'Validation error' });
  }
});

app.use('/api/blockfrost', async (req, res) => {
  try {
    const network = pickNetwork(req);
    const cfg = getNetworkConfig(network);
    const path = req.url || '/';
    const targetUrl = `${cfg.baseUrl}${path}`;

    const forwardHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'x-network') continue;
      if (typeof value === 'string') forwardHeaders[name] = value;
    }
    // Avoid gzip/br mismatch when re-sending through Express.
    forwardHeaders['accept-encoding'] = 'identity';
    forwardHeaders.project_id = cfg.key;

    const isBodyMethod = req.method !== 'GET' && req.method !== 'HEAD';
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: isBodyMethod ? req : undefined,
      duplex: isBodyMethod ? 'half' : undefined,
    });

    res.status(upstream.status);
    for (const [name, value] of upstream.headers.entries()) {
      const lower = name.toLowerCase();
      if (lower === 'transfer-encoding' || lower === 'content-encoding' || lower === 'content-length') continue;
      res.setHeader(name, value);
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
  console.log(`[api] mainnet key: ${NETWORKS.mainnet.key ? 'configured' : 'missing'}`);
  console.log(`[api] testnet key: ${NETWORKS.testnet.key ? 'configured' : 'missing'}`);
});
