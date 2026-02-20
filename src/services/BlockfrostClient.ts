/**
 * Thin REST wrapper around the Blockfrost API.
 * Used by TestnetBlockchain for querying on-chain metadata
 * and for eligibility role checks.
 */

export interface BlockfrostMetadataEntry {
  tx_hash: string;
  json_metadata: Record<string, unknown> | null;
}

export interface BlockfrostBlockInfo {
  slot: number;
  height: number;
  time: number;
}

export interface BlockfrostTxInfo {
  hash: string;
  block_height: number;
  block_time?: number;
  index: number;
  slot: number;
}

export interface BlockfrostTxUtxos {
  hash: string;
  inputs: { address: string; amount: { unit: string; quantity: string }[]; tx_hash: string; output_index: number }[];
  outputs: { address: string; amount: { unit: string; quantity: string }[]; output_index: number }[];
}

export interface BlockfrostAccountInfo {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string;
  rewards_sum: string;
  pool_id: string | null;
  drep_id?: string | null;
}

export interface BlockfrostAddressInfo {
  address: string;
  amount: { unit: string; quantity: string }[];
  stake_address: string | null;
  type: string;
  script: boolean;
}

export interface BlockfrostDRepInfo {
  drep_id: string;
  hex?: string;
  retired: boolean;
  expired: boolean;
  amount?: string;
}

export class BlockfrostClient {
  private apiBase: string;
  private baseUrl: string;
  private network: 'testnet' | 'mainnet';
  private ttlMs = Number(import.meta.env.VITE_BLOCKFROST_CACHE_TTL_MS || 300_000);
  private cache = {
    account: new Map<string, { at: number; value: BlockfrostAccountInfo | null }>(),
    address: new Map<string, { at: number; value: BlockfrostAddressInfo | null }>(),
    drep: new Map<string, { at: number; value: BlockfrostDRepInfo | null }>(),
    spoPower: new Map<string, { at: number; value: bigint | null }>(),
    poolPower: new Map<string, { at: number; value: bigint | null }>(),
    isDrep: new Map<string, { at: number; value: boolean }>(),
    isSpo: new Map<string, { at: number; value: boolean }>(),
    isPool: new Map<string, { at: number; value: boolean }>(),
    isCc: new Map<string, { at: number; value: boolean }>(),
    ccByHash: new Map<string, { at: number; value: boolean }>(),
    isStakeholder: new Map<string, { at: number; value: boolean }>(),
  };
  private storagePrefix = 'cip17_bf_cache';

  constructor(projectId: string, network: 'preview' | 'mainnet' = 'preview') {
    void projectId; // keys are resolved server-side by the backend proxy
    this.network = network === 'mainnet' ? 'mainnet' : 'testnet';
    const configuredBase = (import.meta.env.VITE_BACKEND_API_BASE as string | undefined)?.trim();
    const pagesFallback =
      typeof window !== 'undefined' && window.location.hostname.endsWith('.pages.dev')
        ? 'https://cip-17-survey-tool.onrender.com/api'
        : '/api';
    this.apiBase = (configuredBase || pagesFallback).replace(/\/+$/, '');
    this.baseUrl = `${this.apiBase}/blockfrost`;
    this.restoreCacheFromStorage();
  }

  private networkHeader(): Record<string, string> {
    return { 'x-network': this.network };
  }

  private readCache<T>(map: Map<string, { at: number; value: T }>, key: string): T | undefined {
    const hit = map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      map.delete(key);
      this.persistSingleCacheMap(map);
      return undefined;
    }
    return hit.value;
  }

  private writeCache<T>(map: Map<string, { at: number; value: T }>, key: string, value: T): T {
    map.set(key, { at: Date.now(), value });
    this.persistSingleCacheMap(map);
    return value;
  }

  private getCacheName(
    target: Map<string, { at: number; value: unknown }>
  ): keyof BlockfrostClient['cache'] | null {
    const entries = Object.entries(this.cache) as Array<
      [keyof BlockfrostClient['cache'], Map<string, { at: number; value: unknown }>]
    >;
    for (const [name, map] of entries) {
      if (map === target) return name;
    }
    return null;
  }

  private storageKey(name: keyof BlockfrostClient['cache']): string {
    return `${this.storagePrefix}:${this.network}:${String(name)}`;
  }

  private cacheReplacer(_key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
      return `__bf_bigint:${value.toString()}`;
    }
    return value;
  }

  private cacheReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('__bf_bigint:')) {
      try {
        return BigInt(value.slice('__bf_bigint:'.length));
      } catch {
        return value;
      }
    }
    return value;
  }

  private persistSingleCacheMap(
    map: Map<string, { at: number; value: unknown }>
  ): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const name = this.getCacheName(map);
    if (!name) return;
    try {
      const payload: Record<string, { at: number; value: unknown }> = {};
      for (const [key, entry] of map.entries()) {
        payload[key] = { at: entry.at, value: entry.value };
      }
      window.localStorage.setItem(
        this.storageKey(name),
        JSON.stringify(payload, this.cacheReplacer)
      );
    } catch {
      // Best-effort cache persistence only.
    }
  }

  private restoreCacheFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const now = Date.now();
    const entries = Object.entries(this.cache) as Array<
      [keyof BlockfrostClient['cache'], Map<string, { at: number; value: unknown }>]
    >;

    for (const [name, map] of entries) {
      try {
        const raw = window.localStorage.getItem(this.storageKey(name));
        if (!raw) continue;
        const parsed = JSON.parse(raw, this.cacheReviver) as Record<
          string,
          { at: number; value: unknown }
        >;
        if (!parsed || typeof parsed !== 'object') continue;

        map.clear();
        for (const [key, entry] of Object.entries(parsed)) {
          if (!entry || typeof entry.at !== 'number') continue;
          if (now - entry.at > this.ttlMs) continue;
          map.set(key, { at: entry.at, value: entry.value });
        }
      } catch {
        // Ignore malformed cache payloads.
      }
    }
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.networkHeader(),
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blockfrost API error ${res.status}: ${text}`);
    }

    return res.json() as T;
  }

  /**
   * Fetch but return null on 404 instead of throwing.
   * Useful for optional lookups (account info, DRep status, etc.)
   */
  private async fetchOrNull<T>(path: string): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        ...this.networkHeader(),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blockfrost API error ${res.status}: ${text}`);
    }
    return res.json() as T;
  }

  /** Get metadata entries for a specific label (paginated) */
  async getMetadataByLabel(
    label: number,
    page = 1,
    count = 100
  ): Promise<BlockfrostMetadataEntry[]> {
    return this.fetch<BlockfrostMetadataEntry[]>(
      `/metadata/txs/labels/${label}?page=${page}&count=${count}`
    );
  }

  /** Health check for backend service and configured keys */
  async getServiceHealth(): Promise<{ ok: boolean; keys?: { mainnet: boolean; testnet: boolean }; ts?: number } | null> {
    try {
      const res = await fetch(`${this.apiBase}/health`, { headers: this.networkHeader() });
      if (!res.ok) return null;
      return await res.json() as { ok: boolean; keys?: { mainnet: boolean; testnet: boolean }; ts?: number };
    } catch {
      return null;
    }
  }

  /** Indexed survey entries from backend cache */
  async getIndexedSurveys(): Promise<Array<{
    tx_hash: string;
    json_metadata: Record<string, unknown> | null;
    slot?: number;
    index?: number;
    block_time?: number;
  }>> {
    const res = await fetch(`${this.apiBase}/index/surveys`, {
      headers: this.networkHeader(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Indexed surveys error ${res.status}: ${text}`);
    }
    const data = await res.json() as { surveys?: Array<{
      tx_hash: string;
      json_metadata: Record<string, unknown> | null;
      slot?: number;
      index?: number;
      block_time?: number;
    }> };
    return data.surveys ?? [];
  }

  /** Indexed response entries from backend cache */
  async getIndexedResponses(
    surveyTxId: string,
    sinceSlot?: number
  ): Promise<Array<{
    tx_hash: string;
    json_metadata: Record<string, unknown> | null;
    slot?: number;
    index?: number;
    block_time?: number;
    input_address?: string;
  }>> {
    const qs = typeof sinceSlot === 'number' && sinceSlot > 0 ? `?sinceSlot=${sinceSlot}` : '';
    const res = await fetch(`${this.apiBase}/index/responses/${surveyTxId}${qs}`, {
      headers: this.networkHeader(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Indexed responses error ${res.status}: ${text}`);
    }
    const data = await res.json() as { responses?: Array<{
      tx_hash: string;
      json_metadata: Record<string, unknown> | null;
      slot?: number;
      index?: number;
      block_time?: number;
      input_address?: string;
    }> };
    return data.responses ?? [];
  }

  /** Get transaction metadata for a specific tx hash */
  async getTransactionMetadata(
    txHash: string
  ): Promise<{ label: string; json_metadata: Record<string, unknown> }[]> {
    return this.fetch(
      `/txs/${txHash}/metadata`
    );
  }

  /** Get transaction details */
  async getTransaction(txHash: string): Promise<BlockfrostTxInfo> {
    return this.fetch<BlockfrostTxInfo>(`/txs/${txHash}`);
  }

  /** Get transaction UTxOs (inputs and outputs) */
  async getTransactionUtxos(txHash: string): Promise<BlockfrostTxUtxos> {
    return this.fetch<BlockfrostTxUtxos>(`/txs/${txHash}/utxos`);
  }

  /** Get latest block info */
  async getLatestBlock(): Promise<BlockfrostBlockInfo> {
    return this.fetch<BlockfrostBlockInfo>('/blocks/latest');
  }

  /** Submit a signed transaction (CBOR hex) */
  async submitTransaction(cborHex: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/tx/submit`, {
      method: 'POST',
      headers: {
        ...this.networkHeader(),
        'Content-Type': 'application/cbor',
      },
      body: hexToBytes(cborHex).buffer as ArrayBuffer,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blockfrost submit error ${res.status}: ${text}`);
    }

    return res.text();
  }

  // ─── Eligibility Check Endpoints ────────────────────────────────────

  /**
   * Get account info for a stake address.
   * Returns null if the address has never been seen on-chain.
   */
  async getAccountInfo(stakeAddress: string): Promise<BlockfrostAccountInfo | null> {
    const cached = this.readCache(this.cache.account, stakeAddress);
    if (cached !== undefined) return cached;
    const value = await this.fetchOrNull<BlockfrostAccountInfo>(`/accounts/${stakeAddress}`);
    return this.writeCache(this.cache.account, stakeAddress, value);
  }

  /**
   * Get address info (including the associated stake address).
   * Works with both bech32 and hex-encoded addresses.
   * Returns null if the address has never been seen on-chain.
   */
  async getAddressInfo(address: string): Promise<BlockfrostAddressInfo | null> {
    const cached = this.readCache(this.cache.address, address);
    if (cached !== undefined) return cached;
    const value = await this.fetchOrNull<BlockfrostAddressInfo>(`/addresses/${address}`);
    return this.writeCache(this.cache.address, address, value);
  }

  /**
   * Check if a stake address is a registered (non-retired) DRep.
   *
   * Strategy: Extract the 28-byte stake credential hex from the bech32
   * stake address, then query Blockfrost /governance/dreps/{hex}.
   * Blockfrost accepts both bech32 and hex DRep IDs.
   * A DRep is considered active if `retired` is false.
   */
  /**
   * Check if a DRep ID is registered and not retired on-chain.
   * Accepts the DRep ID in whatever format Blockfrost expects
   * (bech32 drep1.../drep_test1..., or CIP-105 hex).
   *
   * The caller is responsible for providing a valid DRep ID —
   * typically obtained from the wallet via CIP-95 getPubDRepKey().
   */
  async isDRep(drepId: string): Promise<boolean> {
    const cached = this.readCache(this.cache.isDrep, drepId);
    if (cached !== undefined) return cached;
    try {
      console.log('[isDRep] Querying DRep ID:', drepId);
      const drepInfo = await this.fetchOrNull<{
        drep_id: string;
        retired: boolean;
        expired: boolean;
      }>(`/governance/dreps/${drepId}`);
      console.log('[isDRep] Response:', drepInfo);

      const value = Boolean(drepInfo && !drepInfo.retired);
      return this.writeCache(this.cache.isDrep, drepId, value);
    } catch (err) {
      console.error('[isDRep] Error:', err);
      return this.writeCache(this.cache.isDrep, drepId, false);
    }
  }

  /**
   * Get DRep info including delegated voting power amount (lovelace).
   * Returns null when DRep is not found.
   */
  async getDRepInfo(drepId: string): Promise<BlockfrostDRepInfo | null> {
    const cached = this.readCache(this.cache.drep, drepId);
    if (cached !== undefined) return cached;
    const value = await this.fetchOrNull<BlockfrostDRepInfo>(`/governance/dreps/${drepId}`);
    return this.writeCache(this.cache.drep, drepId, value);
  }

  /**
   * Check if a stake address is an SPO (owns/operates a stake pool).
   *
   * Strategy: Extract the stake credential hex from the stake address,
   * then query Blockfrost's /pools endpoint filtered by this credential.
   * Since Blockfrost doesn't support filtering pools by owner credential
   * directly, we use the /accounts endpoint to look for pool retirement/
   * registration certs, and also check if the account IS a pool's
   * reward address via the addresses endpoint.
   *
   * PoC approach: Check if any pool uses this stake address as its
   * reward account by querying /accounts/{stake_address} and checking
   * if pool_id is present — but that only means delegation, not ownership.
   * A more robust check queries pool metadata. For this PoC we do a
   * pragmatic lookup: derive the pool ID from the credential hex and
   * try /pools/{pool_id} directly.
   */
  async isSPO(stakeAddress: string): Promise<boolean> {
    const cached = this.readCache(this.cache.isSpo, stakeAddress);
    if (cached !== undefined) return cached;
    try {
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return false;

      // Conservative check only: avoid false positives.
      // We intentionally do NOT treat generic stake-account "registered"
      // actions as SPO ownership.
      const poolInfo = await this.fetchOrNull<{ pool_id: string; retirement_epoch: number | null }>(
        `/pools/${credHex}`
      );
      const value = Boolean(poolInfo && poolInfo.retirement_epoch === null);
      return this.writeCache(this.cache.isSpo, stakeAddress, value);
    } catch {
      return this.writeCache(this.cache.isSpo, stakeAddress, false);
    }
  }

  /**
   * Get SPO voting power as pool delegated stake (lovelace), if available.
   * Returns null if no active pool can be resolved for this stake credential.
   */
  async getSPOVotingPower(stakeAddress: string): Promise<bigint | null> {
    const cached = this.readCache(this.cache.spoPower, stakeAddress);
    if (cached !== undefined) return cached;
    try {
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return null;

      const poolInfo = await this.fetchOrNull<{
        retirement_epoch: number | null;
        live_stake?: string;
        active_stake?: string;
      }>(`/pools/${credHex}`);

      if (!poolInfo || poolInfo.retirement_epoch !== null) return this.writeCache(this.cache.spoPower, stakeAddress, null);
      const lovelace = poolInfo.live_stake ?? poolInfo.active_stake;
      if (!lovelace) return this.writeCache(this.cache.spoPower, stakeAddress, null);
      return this.writeCache(this.cache.spoPower, stakeAddress, BigInt(lovelace));
    } catch {
      return this.writeCache(this.cache.spoPower, stakeAddress, null);
    }
  }

  /**
   * Check whether a pool id (pool1...) is an active SPO pool.
   */
  async isActivePool(poolId: string): Promise<boolean> {
    const key = poolId.trim().toLowerCase();
    const cached = this.readCache(this.cache.isPool, key);
    if (cached !== undefined) return cached;
    try {
      if (!key.startsWith('pool')) return this.writeCache(this.cache.isPool, key, false);
      const poolInfo = await this.fetchOrNull<{ retirement_epoch: number | null }>(`/pools/${key}`);
      const value = Boolean(poolInfo && poolInfo.retirement_epoch === null);
      return this.writeCache(this.cache.isPool, key, value);
    } catch {
      return this.writeCache(this.cache.isPool, key, false);
    }
  }

  /**
   * Get active pool voting power (delegated live stake) by pool id.
   */
  async getPoolVotingPower(poolId: string): Promise<bigint | null> {
    const key = poolId.trim().toLowerCase();
    const cached = this.readCache(this.cache.poolPower, key);
    if (cached !== undefined) return cached;
    try {
      if (!key.startsWith('pool')) return this.writeCache(this.cache.poolPower, key, null);
      const poolInfo = await this.fetchOrNull<{
        retirement_epoch: number | null;
        live_stake?: string;
        active_stake?: string;
      }>(`/pools/${key}`);
      if (!poolInfo || poolInfo.retirement_epoch !== null) {
        return this.writeCache(this.cache.poolPower, key, null);
      }
      const lovelace = poolInfo.live_stake ?? poolInfo.active_stake;
      if (!lovelace) return this.writeCache(this.cache.poolPower, key, null);
      return this.writeCache(this.cache.poolPower, key, BigInt(lovelace));
    } catch {
      return this.writeCache(this.cache.poolPower, key, null);
    }
  }

  /**
   * Check if a stake address is a Constitutional Committee member.
   * Queries the CC members list from governance endpoint.
   */
  async isCCMember(stakeAddress: string): Promise<boolean> {
    const cached = this.readCache(this.cache.isCc, stakeAddress);
    if (cached !== undefined) return cached;
    try {
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return false;

      // Query the constitutional committee members
      const members = await this.fetchOrNull<Array<{
        hash: string;
        status: string;
      }>>('/governance/constitutional-committee');

      if (!members || !Array.isArray(members)) return this.writeCache(this.cache.isCc, stakeAddress, false);

      // Check if any CC member hash matches this stake credential
      const value = members.some(
        (m) => m.hash === credHex && m.status === 'active'
      );
      return this.writeCache(this.cache.isCc, stakeAddress, value);
    } catch {
      return this.writeCache(this.cache.isCc, stakeAddress, false);
    }
  }

  /**
   * Check if a raw 28-byte committee credential hash (hex) is an active CC member.
   */
  async isCCMemberByHash(credentialHashHex: string): Promise<boolean> {
    const key = credentialHashHex.toLowerCase();
    const cached = this.readCache(this.cache.ccByHash, key);
    if (cached !== undefined) return cached;
    try {
      const members = await this.fetchOrNull<Array<{
        hash: string;
        status: string;
      }>>('/governance/constitutional-committee');

      if (!members || !Array.isArray(members)) return this.writeCache(this.cache.ccByHash, key, false);
      const value = members.some((m) => m.hash?.toLowerCase() === key && m.status === 'active');
      return this.writeCache(this.cache.ccByHash, key, value);
    } catch {
      return this.writeCache(this.cache.ccByHash, key, false);
    }
  }

  /**
   * Check if a stake address is a stakeholder (holds any ADA).
   * No delegation required — simply having ADA in your wallet qualifies.
   */
  async isStakeholder(stakeAddress: string): Promise<boolean> {
    const cached = this.readCache(this.cache.isStakeholder, stakeAddress);
    if (cached !== undefined) return cached;
    try {
      const account = await this.getAccountInfo(stakeAddress);
      if (!account) return this.writeCache(this.cache.isStakeholder, stakeAddress, false);
      // Any controlled amount > 0 means the wallet holds ADA
      return this.writeCache(this.cache.isStakeholder, stakeAddress, BigInt(account.controlled_amount) > 0n);
    } catch {
      return this.writeCache(this.cache.isStakeholder, stakeAddress, false);
    }
  }

  /**
   * Extract the 28-byte stake credential hex from a stake address.
   * Accepts both bech32 (stake_test1...) and hex-encoded formats.
   * Stake addresses are: 1 byte header + 28 bytes credential.
   */
  private async extractStakeCredentialHex(stakeAddress: string): Promise<string | null> {
    try {
      // If it's hex-encoded (58 hex chars = 29 bytes), extract directly
      if (/^[0-9a-fA-F]+$/.test(stakeAddress) && stakeAddress.length === 58) {
        // Skip first 2 hex chars (1 byte header), take next 56 hex chars (28 bytes)
        return stakeAddress.slice(2, 58).toLowerCase();
      }

      // Otherwise, decode bech32 (stake_test1... or stake1...)
      const decoded = bech32Decode(stakeAddress);
      if (!decoded || decoded.length < 29) return null;
      // Skip the 1-byte header, take the 28-byte credential
      return bytesToHex(decoded.slice(1, 29));
    } catch {
      return null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Minimal bech32 decoder — returns the raw data bytes */
function bech32Decode(str: string): Uint8Array | null {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sepIdx = str.lastIndexOf('1');
  if (sepIdx < 1) return null;

  const data: number[] = [];
  for (let i = sepIdx + 1; i < str.length; i++) {
    const c = CHARSET.indexOf(str.charAt(i).toLowerCase());
    if (c < 0) return null;
    data.push(c);
  }

  // Remove the 6-character checksum
  const payload = data.slice(0, data.length - 6);

  // Convert from 5-bit groups to 8-bit bytes
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  for (const value of payload) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }

  return new Uint8Array(result);
}

/** Minimal bech32 encoder — encodes raw data bytes to bech32 string */
function bech32Encode(hrp: string, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

  // Convert 8-bit bytes to 5-bit groups
  const fiveBit: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      fiveBit.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) fiveBit.push((acc << (5 - bits)) & 31);

  // Compute checksum
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  function polymod(values: number[]): number {
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  }

  const hrpExpand: number[] = [];
  for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) >> 5);
  hrpExpand.push(0);
  for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) & 31);

  const checksumInput = hrpExpand.concat(fiveBit).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(checksumInput) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);

  let result = hrp + '1';
  for (const d of fiveBit.concat(checksum)) result += CHARSET[d];
  return result;
}
