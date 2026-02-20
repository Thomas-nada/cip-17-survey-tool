import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, Users, Hash, TrendingUp, ChevronDown, ChevronUp, Zap, Loader2, Download, Copy } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useI18n } from '../../context/I18nContext.tsx';
import { tallySurveyResponses } from '../../utils/tallying.ts';
import * as blake from 'blakejs';
import toast from 'react-hot-toast';
import { getUserPreferences, setUserPreference, type ExplorerProvider } from '../../utils/userPreferences.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey, EligibilityRole } from '../../types/survey.ts';

const BAR_COLORS = [
  '#14b8a6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f43f5e', '#84cc16',
];

const RESPONSES_PER_PAGE = 10;

/** Format a number as ADA with commas and 2 decimal places */
function formatAda(ada: number): string {
  return ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatUtcTime(timestampMs?: number): string {
  if (typeof timestampMs !== 'number') return 'Unknown UTC';
  const d = new Date(timestampMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function bech32Decode(str: string): Uint8Array | null {
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sepIdx = str.lastIndexOf('1');
  if (sepIdx < 1) return null;
  const data: number[] = [];
  for (let i = sepIdx + 1; i < str.length; i++) {
    const c = charset.indexOf(str.charAt(i).toLowerCase());
    if (c < 0) return null;
    data.push(c);
  }
  if (data.length < 7) return null;
  const payload = data.slice(0, data.length - 6);
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const value of payload) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function bech32Encode(hrp: string, data: Uint8Array): string {
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
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

  const polymod = (values: number[]) => {
    let chk = 1;
    for (const v of values) {
      const top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((top >> i) & 1) chk ^= gen[i];
      }
    }
    return chk;
  };

  const hrpExpand: number[] = [];
  for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) >> 5);
  hrpExpand.push(0);
  for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) & 31);

  const checksumInput = hrpExpand.concat(fiveBit, [0, 0, 0, 0, 0, 0]);
  const mod = polymod(checksumInput) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);

  let result = `${hrp}1`;
  for (const v of fiveBit.concat(checksum)) result += charset[v];
  return result;
}

function deriveStakeFromAddress(address: string): string | null {
  if (!address.startsWith('addr')) return null;
  const bytes = bech32Decode(address);
  if (!bytes || bytes.length < 57) return null;
  const header = bytes[0];
  const type = header >> 4;
  const networkId = header & 0x0f;
  if (type < 0 || type > 3) return null;
  const stakeCred = bytes.slice(29, 57);
  if (stakeCred.length !== 28) return null;
  const isScriptStake = type === 2 || type === 3;
  const stakeHeader = (isScriptStake ? 0xf0 : 0xe0) | networkId;
  const payload = new Uint8Array(1 + stakeCred.length);
  payload[0] = stakeHeader;
  payload.set(stakeCred, 1);
  return bech32Encode(networkId === 1 ? 'stake' : 'stake_test', payload);
}

function deriveCcColdFromStakeAddress(stakeAddress: string): string | null {
  if (!stakeAddress.startsWith('stake')) return null;
  const bytes = bech32Decode(stakeAddress);
  if (!bytes || bytes.length < 29) return null;
  const header = bytes[0];
  const type = header >> 4;
  // Stake credential type: e (key hash), f (script hash)
  const isScript = type === 0x0f;
  const cred = bytes.slice(1, 29);
  if (cred.length !== 28) return null;
  // CIP-129: CC Cold key-hash=0x12, script-hash=0x13
  const cip129Header = isScript ? 0x13 : 0x12;
  const payload = new Uint8Array(1 + cred.length);
  payload[0] = cip129Header;
  payload.set(cred, 1);
  return bech32Encode('cc_cold', payload);
}

function lovelaceFromAddressAmounts(
  amounts?: { unit: string; quantity: string }[]
): bigint | null {
  if (!Array.isArray(amounts) || amounts.length === 0) return null;
  let total = 0n;
  for (const item of amounts) {
    if (item.unit === 'lovelace') {
      total += BigInt(item.quantity);
    }
  }
  return total > 0n ? total : null;
}

async function resolveStakeAddressForLookup(
  blockfrostClient: NonNullable<ReturnType<typeof useApp>['blockfrostClient']>,
  primary?: string,
  secondary?: string
): Promise<string | null> {
  const candidates = [primary, secondary].filter((v): v is string => typeof v === 'string' && v.length > 0);
  for (const candidate of candidates) {
    if (candidate.startsWith('stake')) return candidate;
    const derived = deriveStakeFromAddress(candidate);
    if (derived) return derived;
    if (candidate.startsWith('addr')) {
      try {
        const info = await blockfrostClient.getAddressInfo(candidate);
        if (info?.stake_address) return info.stake_address;
      } catch {
        // Try next candidate/fallback.
      }
    }
  }
  return null;
}

function downloadTextFile(content: string, filename: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  survey: StoredSurvey;
}

type OptionSortMode = 'leading' | 'name' | 'votes' | 'percentage';

export function TallyDashboard({ survey }: Props) {
  const { state, blockfrostClient, mode } = useApp();
  const { t } = useI18n();
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';
  const responses = state.responses.get(survey.surveyTxId) ?? [];
  const weighting = survey.details.voteWeighting ?? 'CredentialBased';
  const isStakeBased = weighting === 'StakeBased';
  const [showAllResponses, setShowAllResponses] = useState(false);

  // Stake map: responseCredential → lovelace (for StakeBased weighting)
  const [stakeMap, setStakeMap] = useState<Map<string, bigint>>(new Map());
  const [stakesLoading, setStakesLoading] = useState(false);
  const [displayVotingPower, setDisplayVotingPower] = useState<Map<string, bigint>>(new Map());
  const [oneVoteCredentials, setOneVoteCredentials] = useState<Set<string>>(new Set());
  const [displayPowerLoading, setDisplayPowerLoading] = useState(false);
  const [resolvedRoleByCredential, setResolvedRoleByCredential] = useState<Map<string, EligibilityRole>>(new Map());
  const [resolvedCcColdByCredential, setResolvedCcColdByCredential] = useState<Map<string, string>>(new Map());
  const [resolvedDisplayCredentialByTx, setResolvedDisplayCredentialByTx] = useState<Map<string, string>>(new Map());
  const [optionSortMode, setOptionSortMode] = useState<OptionSortMode>(
    () => getUserPreferences().defaultResultsSort
  );
  const [explorerProvider, setExplorerProvider] = useState<ExplorerProvider>(
    () => getUserPreferences().explorerProvider
  );
  const [vpDebugEnabled] = useState(() => {
    try {
      const searchFlag = new URLSearchParams(window.location.search).get('vpdebug') === '1';
      const hash = window.location.hash || '';
      const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const hashFlag = new URLSearchParams(hashQuery).get('vpdebug') === '1';
      const storageFlag = window.localStorage.getItem('vpdebug') === '1';
      return searchFlag || hashFlag || storageFlag;
    } catch {
      return false;
    }
  });
  const [isLightTheme, setIsLightTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => setIsLightTheme(root.getAttribute('data-theme') === 'light');
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const apply = () => {
      const prefs = getUserPreferences();
      setExplorerProvider(prefs.explorerProvider);
      setOptionSortMode(prefs.defaultResultsSort);
    };
    const onPrefChanged = () => apply();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('cip17_pref_')) apply();
    };
    window.addEventListener('cip17:preferences-changed', onPrefChanged as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cip17:preferences-changed', onPrefChanged as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Fetch stake amounts for unique voters when StakeBased
  useEffect(() => {
    if (!isStakeBased || responses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setStakeMap(new Map());
      return;
    }

    let cancelled = false;
    setStakesLoading(true);

    (async () => {
      const map = new Map<string, bigint>();
      for (const resp of responses) {
        if (cancelled) return;
        try {
          const cred = resp.responseCredential;
          let lookupAddress = resp.voterAddress ?? cred;

          // Deterministic fallback: use tx input address when available.
          if (!lookupAddress || lookupAddress === 'unknown') {
            try {
              const utxos = await blockfrostClient.getTransactionUtxos(resp.txId);
              const txInput = utxos?.inputs?.[0]?.address;
              if (typeof txInput === 'string' && txInput.length > 0) {
                lookupAddress = txInput;
              }
            } catch {
              // Keep existing lookupAddress fallback.
            }
          }

          const stakeAddress = await resolveStakeAddressForLookup(blockfrostClient, lookupAddress, cred);
          if (stakeAddress) {
            const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
            if (accountInfo) {
              const lovelace = BigInt(accountInfo.controlled_amount);
              map.set(resp.txId, lovelace);
              map.set(cred, lovelace);
              if (lookupAddress.startsWith('addr') || lookupAddress.startsWith('stake')) {
                map.set(lookupAddress, lovelace);
              }
              continue;
            }
          }

          const paymentAddress =
            (lookupAddress.startsWith('addr') ? lookupAddress : null) ??
            (cred.startsWith('addr') ? cred : null);
          if (paymentAddress) {
            const addrInfo = await blockfrostClient.getAddressInfo(paymentAddress);
            const lovelace = lovelaceFromAddressAmounts(addrInfo?.amount);
            if (lovelace !== null) {
              map.set(resp.txId, lovelace);
              map.set(cred, lovelace);
              map.set(paymentAddress, lovelace);
            }
          }
        } catch {
          // Skip — voter stake unknown
        }
      }
      if (!cancelled) {
        setStakeMap(map);
        setStakesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isStakeBased, responses, isOnChainMode, blockfrostClient]);

  // Role-aware display voting power for the response list:
  // DRep/SPO => delegated power, CC => 1 vote, Stakeholder => wallet amount.
  useEffect(() => {
    if (responses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setDisplayVotingPower(new Map());
      setOneVoteCredentials(new Set());
      return;
    }

    const requiredRoles = survey.details.eligibility ?? [];
    const hasDRepRole = requiredRoles.includes('DRep');
    const hasSPORole = requiredRoles.includes('SPO');
    const hasCCRole = requiredRoles.includes('CC');
    const hasStakeholderRole = requiredRoles.includes('Stakeholder');
    const unique = new Map<string, { credential: string; voterAddress?: string }>();
    for (const resp of responses) {
      if (!unique.has(resp.responseCredential)) {
        unique.set(resp.responseCredential, {
          credential: resp.responseCredential,
          voterAddress: resp.voterAddress,
        });
      }
    }

    let cancelled = false;
    setDisplayPowerLoading(true);

    (async () => {
      const map = new Map<string, bigint>();
      const oneVote = new Set<string>();

      for (const { credential, voterAddress } of unique.values()) {
        if (cancelled) return;
        try {
          // DRep delegated power
          if (hasDRepRole) {
            const drepInfo = await blockfrostClient.getDRepInfo(credential);
            if (drepInfo && !drepInfo.retired && drepInfo.amount) {
              map.set(credential, BigInt(drepInfo.amount));
              continue;
            }
          }

          // Resolve stake address for CC/SPO/Stakeholder checks
          const stakeAddress = await resolveStakeAddressForLookup(
            blockfrostClient,
            voterAddress,
            credential
          );

          // CC fixed power
          if (hasCCRole && stakeAddress && await blockfrostClient.isCCMember(stakeAddress)) {
            map.set(credential, 1n);
            oneVote.add(credential);
            continue;
          }

          // SPO delegated pool power
          if (hasSPORole && credential.startsWith('pool')) {
            const poolPower = await blockfrostClient.getPoolVotingPower(credential);
            if (poolPower !== null) {
              map.set(credential, poolPower);
              continue;
            }
          }

          // SPO delegated pool power (stake credential path)
          if (hasSPORole && stakeAddress) {
            const spoPower = await blockfrostClient.getSPOVotingPower(stakeAddress);
            if (spoPower !== null) {
              map.set(credential, spoPower);
              continue;
            }
          }

          // ADA holder default wallet power
          if (hasStakeholderRole || requiredRoles.length === 0) {
            if (stakeAddress) {
              const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
              if (accountInfo) {
                map.set(credential, BigInt(accountInfo.controlled_amount));
                continue;
              }
            }

            const paymentAddress =
              (voterAddress?.startsWith('addr') ? voterAddress : null) ??
              (credential.startsWith('addr') ? credential : null);
            if (paymentAddress) {
              const addrInfo = await blockfrostClient.getAddressInfo(paymentAddress);
              const lovelace = lovelaceFromAddressAmounts(addrInfo?.amount);
              if (lovelace !== null) {
                map.set(credential, lovelace);
              }
            }
          }
        } catch {
          // Skip unknown power for this credential
        }
      }

      if (!cancelled) {
        setDisplayVotingPower(map);
        setOneVoteCredentials(oneVote);
        setDisplayPowerLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [responses, isOnChainMode, blockfrostClient, survey.details.eligibility]);

  // Resolve a role badge per credential for response-list display.
  useEffect(() => {
    if (responses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setResolvedRoleByCredential(new Map());
      setResolvedCcColdByCredential(new Map());
      return;
    }

    const requiredRoles = survey.details.eligibility ?? [];
    const shouldCheckDRep = requiredRoles.length === 0 || requiredRoles.includes('DRep');
    const shouldCheckCC = requiredRoles.length === 0 || requiredRoles.includes('CC');
    const shouldCheckSPO = requiredRoles.length === 0 || requiredRoles.includes('SPO');
    const shouldCheckStakeholder = requiredRoles.length === 0 || requiredRoles.includes('Stakeholder');

    let cancelled = false;
    const unique = new Map<string, { credential: string; voterAddress?: string }>();
    for (const resp of responses) {
      if (!unique.has(resp.responseCredential)) {
        unique.set(resp.responseCredential, {
          credential: resp.responseCredential,
          voterAddress: resp.voterAddress,
        });
      }
    }

    (async () => {
      const roleMap = new Map<string, EligibilityRole>();
      const ccColdMap = new Map<string, string>();
      for (const { credential, voterAddress } of unique.values()) {
        if (cancelled) return;
        try {
          if (shouldCheckDRep && credential.startsWith('drep')) {
            if (await blockfrostClient.isDRep(credential)) {
              roleMap.set(credential, 'DRep');
              continue;
            }
          }

          const stakeAddress =
            (credential.startsWith('stake') ? credential : null) ??
            (voterAddress?.startsWith('stake') ? voterAddress : null) ??
            deriveStakeFromAddress(credential) ??
            deriveStakeFromAddress(voterAddress ?? '');

          if (shouldCheckSPO && credential.startsWith('pool')) {
            if (await blockfrostClient.isActivePool(credential)) {
              roleMap.set(credential, 'SPO');
              continue;
            }
          }

          if (!stakeAddress) continue;

          if (shouldCheckCC && await blockfrostClient.isCCMember(stakeAddress)) {
            roleMap.set(credential, 'CC');
            const ccCold = deriveCcColdFromStakeAddress(stakeAddress);
            if (ccCold) ccColdMap.set(credential, ccCold);
            continue;
          }
          if (shouldCheckSPO && await blockfrostClient.isSPO(stakeAddress)) {
            roleMap.set(credential, 'SPO');
            continue;
          }
          if (shouldCheckStakeholder && await blockfrostClient.isStakeholder(stakeAddress)) {
            roleMap.set(credential, 'Stakeholder');
          }
        } catch {
          // Ignore unresolved role badge for this credential.
        }
      }
      if (!cancelled) {
        setResolvedRoleByCredential(roleMap);
        setResolvedCcColdByCredential(ccColdMap);
      }
    })();

    return () => { cancelled = true; };
  }, [responses, isOnChainMode, blockfrostClient, survey.details.eligibility]);

  // UI fallback: if a stored credential is still addr..., resolve to stake...
  // so SPO/stake identities are displayed consistently in the response table.
  useEffect(() => {
    if (!isOnChainMode || !blockfrostClient || responses.length === 0) {
      setResolvedDisplayCredentialByTx(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      const next = new Map<string, string>();
      for (const resp of responses) {
        const cred = resp.responseCredential;
        if (!cred.startsWith('addr')) continue;
        try {
          const lookup = resp.voterAddress ?? cred;
          const addrInfo = await blockfrostClient.getAddressInfo(lookup);
          if (addrInfo?.stake_address) {
            next.set(resp.txId, addrInfo.stake_address);
          }
        } catch {
          // Ignore unresolved entries and keep addr... as fallback.
        }
      }
      if (!cancelled) {
        setResolvedDisplayCredentialByTx(next);
      }
    })();

    return () => { cancelled = true; };
  }, [responses, isOnChainMode, blockfrostClient]);

  const tally = useMemo(() => {
    if (responses.length === 0) return null;
    return tallySurveyResponses(
      survey.details,
      responses,
      weighting,
      isStakeBased ? stakeMap : undefined
    );
  }, [survey.details, responses, weighting, isStakeBased, stakeMap]);

  if (!tally || responses.length === 0) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-12 text-center animate-fadeIn">
        <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
          <BarChart3 className="w-10 h-10 text-slate-600" />
        </div>
        <p className="text-slate-400 font-medium mb-1">{t('results.noResponsesYet')}</p>
        <p className="text-sm text-slate-500">
          {t('results.submitToSee')}
        </p>
      </div>
    );
  }

  const method = survey.details.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;
  const chartGridColor = isLightTheme ? '#94a3b8' : '#1e293b';
  const chartAxisPrimary = isLightTheme ? '#334155' : '#94a3b8';
  const chartAxisSecondary = isLightTheme ? '#475569' : '#64748b';
  const tooltipBg = isLightTheme ? '#f8fafc' : '#0c0f1a';
  const tooltipBorder = isLightTheme ? '1px solid rgba(100, 116, 139, 0.35)' : '1px solid rgba(20, 184, 166, 0.2)';
  const tooltipText = isLightTheme ? '#0f172a' : '#f1f5f9';

  const displayedResponses = showAllResponses
    ? responses
    : responses.slice(0, RESPONSES_PER_PAGE);

  const latestCountedByVoter = useMemo(() => {
    const ordered = [...responses]
      .filter((r) => r.identityVerified !== false)
      .sort((a, b) => {
      if (a.slot !== b.slot) return a.slot - b.slot;
      return a.txIndexInBlock - b.txIndexInBlock;
    });
    const latest = new Map<string, string>();
    for (const resp of ordered) {
      const voterKey = resp.voterAddress ?? resp.responseCredential;
      latest.set(voterKey, resp.txId);
    }
    return latest;
  }, [responses]);

  const responseAuditRows = useMemo(() => {
    return responses.map((resp) => {
      const voterKey = resp.voterAddress ?? resp.responseCredential;
      const unverified = resp.identityVerified === false;
      const superseded = latestCountedByVoter.get(voterKey) !== resp.txId;
      const isCounted = !unverified && !superseded;
      const power = displayVotingPower.get(resp.responseCredential);
      return {
        txId: resp.txId,
        surveyTxId: resp.surveyTxId,
        responseCredential: resp.responseCredential,
        voterAddress: resp.voterAddress ?? '',
        value: resp.selection !== undefined ? resp.selection.join('|') : (resp.numericValue ?? ''),
        votingPowerLovelace: power !== undefined ? power.toString() : '',
        counted: isCounted,
        status: unverified ? 'unverified' : superseded ? 'superseded' : 'counted',
        slot: resp.slot,
        txIndexInBlock: resp.txIndexInBlock,
        utcTime: formatUtcTime(resp.timestampMs),
        reason: resp.identityVerificationReason ?? '',
      };
    });
  }, [responses, latestCountedByVoter, displayVotingPower]);

  const tallySnapshotHash = useMemo(() => {
    const counted = responseAuditRows
      .filter((r) => r.counted)
      .sort((a, b) => a.slot - b.slot || a.txIndexInBlock - b.txIndexInBlock || a.txId.localeCompare(b.txId));
    const canonical = JSON.stringify({
      surveyTxId: survey.surveyTxId,
      surveyHash: survey.surveyHash,
      weighting: tally.weighting,
      totalResponses: tally.totalResponses,
      totalWeight: tally.totalWeight,
      counted,
      optionTallies: tally.optionTallies,
      numericTally: tally.numericTally,
    });
    const bytes = new TextEncoder().encode(canonical);
    return blake.blake2bHex(bytes, undefined, 32);
  }, [responseAuditRows, survey.surveyTxId, survey.surveyHash, tally]);

  const exportAuditJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      surveyTxId: survey.surveyTxId,
      surveyHash: survey.surveyHash,
      tally,
      snapshotHash: tallySnapshotHash,
      responses: responseAuditRows,
    };
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `tally-audit-${survey.surveyTxId.slice(0, 12)}.json`,
      'application/json'
    );
  };

  const exportAuditCsv = () => {
    const header = [
      'tx_id', 'survey_tx_id', 'response_credential', 'voter_address', 'value',
      'voting_power_lovelace', 'counted', 'status', 'slot', 'tx_index', 'utc_time', 'reason',
    ];
    const rows = responseAuditRows.map((r) => [
      r.txId, r.surveyTxId, r.responseCredential, r.voterAddress, String(r.value),
      r.votingPowerLovelace, String(r.counted), r.status, String(r.slot), String(r.txIndexInBlock), r.utcTime, r.reason,
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((line) => line.map((c) => esc(c)).join(',')).join('\n');
    downloadTextFile(csv, `tally-audit-${survey.surveyTxId.slice(0, 12)}.csv`, 'text/csv');
  };

  // Find the leading option (by weight for StakeBased, by count otherwise)
  const leadingOption = isOptionBased && tally.optionTallies
    ? tally.optionTallies.reduce((max, t) => {
        const metric = isStakeBased ? t.weight : t.count;
        const maxMetric = isStakeBased ? max.weight : max.count;
        return metric > maxMetric ? t : max;
      }, tally.optionTallies[0])
    : null;
  const optionTotalMetric = useMemo(() => {
    if (!isOptionBased || !tally.optionTallies) return 0;
    return isStakeBased
      ? tally.optionTallies.reduce((sum, x) => sum + x.weight, 0)
      : tally.optionTallies.reduce((sum, x) => sum + x.count, 0);
  }, [isOptionBased, tally.optionTallies, isStakeBased]);
  const sortedOptionTallies = useMemo(() => {
    if (!isOptionBased || !tally.optionTallies) return [];
    const items = [...tally.optionTallies];
    if (optionSortMode === 'name') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      return items;
    }
    if (optionSortMode === 'votes') {
      items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return items;
    }
    if (optionSortMode === 'percentage') {
      items.sort((a, b) => {
        const aMetric = isStakeBased ? a.weight : a.count;
        const bMetric = isStakeBased ? b.weight : b.count;
        const aPct = optionTotalMetric > 0 ? (aMetric / optionTotalMetric) * 100 : 0;
        const bPct = optionTotalMetric > 0 ? (bMetric / optionTotalMetric) * 100 : 0;
        return bPct - aPct || a.label.localeCompare(b.label);
      });
      return items;
    }
    // Default: always pin detected leader first, then sort remaining by metric.
    items.sort((a, b) => {
      const aIsLeader = leadingOption ? a.label === leadingOption.label : false;
      const bIsLeader = leadingOption ? b.label === leadingOption.label : false;
      if (aIsLeader && !bIsLeader) return -1;
      if (!aIsLeader && bIsLeader) return 1;
      const aMetric = isStakeBased ? a.weight : a.count;
      const bMetric = isStakeBased ? b.weight : b.count;
      return bMetric - aMetric || b.count - a.count || a.label.localeCompare(b.label);
    });
    return items;
  }, [isOptionBased, tally.optionTallies, optionSortMode, isStakeBased, optionTotalMetric, leadingOption]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stakes loading indicator */}
      {isStakeBased && stakesLoading && (
        <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
          <p className="text-xs text-amber-400">Loading stake amounts for weighted results…</p>
        </div>
      )}
      {displayPowerLoading && (
        <div className="flex items-center gap-3 p-3 bg-sky-500/5 border border-sky-500/20 rounded-xl">
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />
          <p className="text-xs text-sky-400">Loading role-based voting power…</p>
        </div>
      )}

      {/* Stats row */}
      <div className={`grid grid-cols-2 ${isStakeBased ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400 font-medium">{t('results.totalResponses')}</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">{tally.totalResponses.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400 font-medium">{t('results.uniqueVoters')}</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">
            {tally.uniqueCredentials.toLocaleString()}
          </p>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-slate-400 font-medium">{t('results.weighting')}</span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5">
            {isStakeBased ? t('results.stakeBased') : t('results.credentialBased')}
          </p>
        </div>
        {isStakeBased && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">{t('results.totalVotingPower')}</span>
            </div>
            <p className="text-lg font-bold text-white font-code">
              {formatAda(tally.totalWeight)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ADA</p>
          </div>
        )}
        {isNumeric && tally.numericTally && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">{t('results.median')}</span>
            </div>
            <p className="text-2xl font-bold font-code text-white">
              {tally.numericTally.median}
            </p>
          </div>
        )}
      </div>

      {/* Tally policy + audit exports */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-300 font-heading">{t('results.tallyPolicy')}</h4>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(tallySnapshotHash);
                toast.success('Snapshot hash copied');
              }}
              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('results.copySnapshotHash')}
            </button>
            <button
              type="button"
              onClick={exportAuditJson}
              className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              {t('results.exportJson')}
            </button>
            <button
              type="button"
              onClick={exportAuditCsv}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              {t('results.exportCsv')}
            </button>
          </div>
        </div>
        <ul className="text-xs text-slate-400 list-disc pl-4 space-y-1">
          <li>{t('results.policyLatestVote')}</li>
          <li>{t('results.policyUnverifiedExcluded')}</li>
          <li>{t('results.policyWeighting')}</li>
        </ul>
        <p className="text-[11px] text-slate-500 font-code break-all">
          {t('results.snapshotHash', { hash: tallySnapshotHash })}
        </p>
      </div>

      {/* Option-based chart */}
      {isOptionBased && tally.optionTallies && (
        <div className="tally-chart-card bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-sm font-semibold text-slate-300 font-heading">
              {t('results.voteDistributionList')}
            </h4>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide" htmlFor="option-sort-mode">
                {t('results.sort')}
              </label>
              <select
                id="option-sort-mode"
                value={optionSortMode}
                onChange={(e) => {
                  const value = e.target.value as OptionSortMode;
                  setOptionSortMode(value);
                  setUserPreference('defaultResultsSort', value);
                }}
                className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1"
              >
                <option value="leading">{t('results.sortLeading')}</option>
                <option value="name">{t('results.sortName')}</option>
                <option value="votes">{t('results.sortVotes')}</option>
                <option value="percentage">{t('results.sortPercentage')}</option>
              </select>
              {isStakeBased && (
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  {t('results.weightedByAda')}
                </span>
              )}
            </div>
          </div>

          {/* Option breakdown */}
          <div className="space-y-3">
            {sortedOptionTallies.map((item, i) => {
              const metric = isStakeBased ? item.weight : item.count;
              const pct = optionTotalMetric > 0 ? (metric / optionTotalMetric) * 100 : 0;
              const isLeading = leadingOption?.label === item.label;
              return (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                  isLeading ? 'bg-slate-800/50' : ''
                }`}>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                  <span className={`text-sm flex-1 ${isLeading ? 'text-white font-semibold' : 'text-slate-300'}`}>
                    {item.label}
                  </span>
                  {/* Vote count */}
                  <span className="text-sm font-code text-slate-400 tabular-nums">
                    {item.count.toLocaleString()} {item.count === 1 ? t('vote.singleVote') : t('vote.multipleVotes')}
                  </span>
                  {/* Voting power (StakeBased only) */}
                  {isStakeBased && (
                    <span className="text-xs font-code text-amber-400 tabular-nums min-w-[80px] text-right">
                      {formatAda(item.weight)} ₳
                    </span>
                  )}
                  <div className="w-28 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-14 text-right font-code tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Numeric results */}
      {isNumeric && tally.numericTally && (
        <div className="tally-chart-card bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-5 font-heading">
            Value Distribution
          </h4>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Mean', value: tally.numericTally.mean.toFixed(1), color: 'text-teal-400' },
              { label: 'Median', value: tally.numericTally.median.toFixed(1), color: 'text-emerald-400' },
              { label: 'Min', value: tally.numericTally.min, color: 'text-slate-400' },
              { label: 'Max', value: tally.numericTally.max, color: 'text-slate-400' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-4 text-center"
              >
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-xl font-bold font-code ${color}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Histogram */}
          {tally.numericTally.bins.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tally.numericTally.bins}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="range"
                  tick={{ fill: chartAxisPrimary, fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: chartAxisSecondary, fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: tooltipBg,
                    border: tooltipBorder,
                    borderRadius: '12px',
                    color: tooltipText,
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Response list */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/30 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-300 font-heading">
            {t('results.individualResponses')}
          </h4>
          <span className="text-xs text-slate-500 font-code">
            {t('results.total', { count: responses.length.toLocaleString() })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30">
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {t('results.credential')}
                </th>
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {t('results.value')}
                </th>
                <th className="px-5 py-3 text-right text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {t('results.votingPower')}
                </th>
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {t('results.utcTime')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedResponses.map((resp) => {
                const voterLovelace = stakeMap.get(resp.txId)
                  ?? stakeMap.get(resp.responseCredential)
                  ?? (resp.voterAddress ? stakeMap.get(resp.voterAddress) : undefined);
                const role = resolvedRoleByCredential.get(resp.responseCredential);
                const ccCold = resolvedCcColdByCredential.get(resp.responseCredential);
                const derivedStake =
                  deriveStakeFromAddress(resp.responseCredential) ??
                  deriveStakeFromAddress(resp.voterAddress ?? '') ??
                  resolvedDisplayCredentialByTx.get(resp.txId);
                const addrDisplay =
                  (resp.voterAddress?.startsWith('addr') ? resp.voterAddress : null) ??
                  (resp.responseCredential.startsWith('addr') ? resp.responseCredential : null);
                const cred = role === 'SPO' || role === 'CC'
                  ? (role === 'CC' ? (ccCold ?? derivedStake ?? resp.responseCredential) : (derivedStake ?? resp.responseCredential))
                  : role === 'DRep'
                    ? resp.responseCredential
                    : (addrDisplay ?? resp.responseCredential);
                const isDRepId = cred.startsWith('drep');
                const isCcCold = cred.startsWith('cc_cold');
                const explorerBase = explorerProvider === 'cexplorer'
                  ? (mode === 'mainnet' ? 'https://cexplorer.io' : 'https://preview.cexplorer.io')
                  : (mode === 'mainnet' ? 'https://cardanoscan.io' : 'https://preview.cardanoscan.io');
                const explorerUrl = isDRepId
                  ? `${explorerBase}/drep/${cred}`
                  : !isCcCold
                    ? `${explorerBase}/address/${cred}`
                    : '';
                const voterKey = resp.voterAddress ?? resp.responseCredential;
                const unverified = resp.identityVerified === false;
                const superseded = latestCountedByVoter.get(voterKey) !== resp.txId;
                const isCounted = !unverified && !superseded;
                const txPower = stakeMap.get(resp.txId);
                const credPower = stakeMap.get(resp.responseCredential);
                const voterPower = resp.voterAddress ? stakeMap.get(resp.voterAddress) : undefined;
                const resolvedPower = isStakeBased
                  ? (txPower ?? credPower ?? voterPower ?? displayVotingPower.get(resp.responseCredential))
                  : displayVotingPower.get(resp.responseCredential);
                return (
                  <tr
                    key={resp.txId}
                    className={`border-b border-slate-800/30 transition-colors ${
                      isCounted ? 'hover:bg-slate-800/20' : 'bg-slate-900/20'
                    }`}
                  >
                    <td className="px-5 py-3 font-code text-xs">
                      {isCcCold ? (
                        <span className={`${isCounted ? 'text-teal-300' : 'text-slate-500 line-through'}`}>
                          {cred.slice(0, 16)}…
                        </span>
                      ) : (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`underline underline-offset-2 transition-colors ${
                            isCounted
                              ? 'text-teal-400 hover:text-teal-300 decoration-teal-400/30 hover:decoration-teal-300/60'
                              : 'text-slate-500 hover:text-slate-400 decoration-slate-500/30 line-through'
                          }`}
                        >
                          {cred.slice(0, 16)}…
                        </a>
                      )}
                      {role && (
                        <span className={`ml-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          role === 'DRep'
                            ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
                            : role === 'CC'
                              ? 'border-sky-500/25 bg-sky-500/10 text-sky-300'
                              : role === 'SPO'
                                ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                        }`}>
                          {t(`role.${role}`)}
                        </span>
                      )}
                      {!isCounted && (
                        <span className="ml-2 inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                          {unverified ? t('results.notCountedUnverified') : t('results.notCounted')}
                        </span>
                      )}
                    </td>
                    <td className={`px-5 py-3 text-xs ${isCounted ? 'text-slate-300' : 'text-slate-500 line-through'}`}>
                      {resp.selection !== undefined && (
                        <span>
                          {resp.selection
                            .map(
                              (i) =>
                                survey.details.options?.[i] ?? `[${i}]`
                            )
                            .join(', ')}
                        </span>
                      )}
                      {resp.numericValue !== undefined && (
                        <span className="font-code font-semibold">{resp.numericValue.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-code text-xs text-amber-400">
                      {(() => {
                        const power = resolvedPower;
                        if (power === undefined) return <span className="text-slate-600">—</span>;
                        if (oneVoteCredentials.has(resp.responseCredential)) {
                          return <span className="text-emerald-300">1 vote</span>;
                        }
                        return `${formatAda(Number(power) / 1_000_000)} ₳`;
                      })()}
                      {vpDebugEnabled && (
                        <div className="mt-1 text-[10px] leading-tight text-slate-500 text-left">
                          <div>tx:{resp.txId.slice(0, 10)} map:{stakeMap.size}</div>
                          <div>txKey:{txPower?.toString() ?? 'null'}</div>
                          <div>credKey:{credPower?.toString() ?? 'null'}</div>
                          <div>voterKey:{voterPower?.toString() ?? 'null'}</div>
                          <div>display:{displayVotingPower.get(resp.responseCredential)?.toString() ?? 'null'}</div>
                          <div>resolved:{resolvedPower?.toString() ?? 'null'}</div>
                        </div>
                      )}
                    </td>
                    <td className={`px-5 py-3 font-code text-xs ${isCounted ? 'text-slate-500' : 'text-slate-600 line-through'}`}>
                      {formatUtcTime(resp.timestampMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Show more / less */}
        {responses.length > RESPONSES_PER_PAGE && (
          <div className="px-5 py-3 border-t border-slate-700/30">
            <button
              onClick={() => setShowAllResponses(!showAllResponses)}
              className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors"
            >
              {showAllResponses ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  {t('results.showLess')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  {t('results.showAllResponses', { count: responses.length })}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
