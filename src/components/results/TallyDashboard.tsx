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
import { MarkdownContent } from '../shared/MarkdownContent.tsx';
import { getUserPreferences, setUserPreference, type ExplorerProvider } from '../../utils/userPreferences.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey, EligibilityRole, SurveyQuestion, SurveyAnswer } from '../../types/survey.ts';

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

function mapToSerializablePowers(map: Map<string, bigint>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of map.entries()) {
    out[key] = value.toString();
  }
  return out;
}

function parseSerializablePowers(input: Record<string, string>): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const [key, value] of Object.entries(input)) {
    try {
      map.set(key, BigInt(value));
    } catch {
      // Ignore malformed entries.
    }
  }
  return map;
}

interface Props {
  survey: StoredSurvey;
}

type OptionSortMode = 'leading' | 'name' | 'votes' | 'percentage';
type RoleFilterValue = 'all' | EligibilityRole;
const STAKE_SNAPSHOT_VERSION = 1;

type StakeSnapshotPayload = {
  version: number;
  surveyTxId: string;
  endEpoch: number;
  capturedAtEpoch: number | null;
  capturedAt: number;
  powers: Record<string, string>;
};

export function TallyDashboard({ survey }: Props) {
  const { state, blockfrostClient, mode, currentEpoch } = useApp();
  const { t } = useI18n();
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';
  const responses = state.responses.get(survey.surveyTxId) ?? [];
  const configuredRoleWeighting = useMemo(
    () => survey.details.roleWeighting ?? {},
    [survey.details.roleWeighting]
  );
  const requiredRoles = useMemo(
    () => Object.keys(configuredRoleWeighting) as EligibilityRole[],
    [configuredRoleWeighting]
  );
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<RoleFilterValue>('all');
  const isCompositeView = requiredRoles.length > 1 && selectedRoleFilter === 'all';
  const surveyEndEpoch = survey.details.endEpoch;
  const surveyClosed = typeof surveyEndEpoch === 'number' &&
    typeof currentEpoch === 'number' &&
    currentEpoch > surveyEndEpoch;
  const snapshotStorageKey = useMemo(
    () => `cip17_stake_snapshot:${mode}:${survey.surveyTxId}:${surveyEndEpoch}`,
    [mode, survey.surveyTxId, surveyEndEpoch]
  );
  const activeRoles = useMemo(
    () => (selectedRoleFilter === 'all' ? requiredRoles : [selectedRoleFilter]),
    [selectedRoleFilter, requiredRoles]
  );
  const filteredResponses = useMemo(
    () => (selectedRoleFilter === 'all' ? responses : responses.filter((r) => r.responderRole === selectedRoleFilter)),
    [responses, selectedRoleFilter]
  );
  const needsStakeMap = useMemo(
    () => activeRoles.some((role) => {
      const mode = configuredRoleWeighting[role];
      return mode === 'StakeBased' || mode === 'PledgeBased';
    }),
    [activeRoles, configuredRoleWeighting]
  );
  const weighting = (Object.values(configuredRoleWeighting)[0] ?? 'CredentialBased');
  const isStakeBased = needsStakeMap;
  const [showAllResponses, setShowAllResponses] = useState(false);

  // Stake map: responseCredential → lovelace (for StakeBased weighting)
  const [stakeMap, setStakeMap] = useState<Map<string, bigint>>(new Map());
  const [snapshotStakeMap, setSnapshotStakeMap] = useState<Map<string, bigint> | null>(null);
  const [snapshotCapturedEpoch, setSnapshotCapturedEpoch] = useState<number | null>(null);
  const [stakesLoading, setStakesLoading] = useState(false);
  const [displayVotingPower, setDisplayVotingPower] = useState<Map<string, bigint>>(new Map());
  const [oneVoteCredentials, setOneVoteCredentials] = useState<Set<string>>(new Set());
  const [displayPowerLoading, setDisplayPowerLoading] = useState(false);
  const [resolvedRoleByCredential, setResolvedRoleByCredential] = useState<Map<string, EligibilityRole>>(new Map());
  const [resolvedCcColdByCredential, setResolvedCcColdByCredential] = useState<Map<string, string>>(new Map());
  const [resolvedSpoPoolByCredential, setResolvedSpoPoolByCredential] = useState<Map<string, string>>(new Map());
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
    if (selectedRoleFilter === 'all') return;
    if (!requiredRoles.includes(selectedRoleFilter)) {
      setSelectedRoleFilter('all');
    }
  }, [requiredRoles, selectedRoleFilter]);

  useEffect(() => {
    setShowAllResponses(false);
  }, [selectedRoleFilter]);
  const questions: SurveyQuestion[] = useMemo(() => {
    if (survey.details.questions && survey.details.questions.length > 0) {
      return survey.details.questions;
    }
    if (survey.details.question && survey.details.methodType) {
      return [{
        questionId: 'q1',
        question: survey.details.question,
        methodType: survey.details.methodType,
        options: survey.details.options,
        maxSelections: survey.details.maxSelections,
        numericConstraints: survey.details.numericConstraints,
        methodSchemaUri: survey.details.methodSchemaUri,
        hashAlgorithm: survey.details.hashAlgorithm,
        methodSchemaHash: survey.details.methodSchemaHash,
      }];
    }
    return [];
  }, [survey.details]);

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

  // Restore a previously captured end-epoch stake snapshot, if present.
  useEffect(() => {
    setSnapshotStakeMap(null);
    setSnapshotCapturedEpoch(null);
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(snapshotStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StakeSnapshotPayload;
      if (!parsed || parsed.version !== STAKE_SNAPSHOT_VERSION) return;
      if (parsed.surveyTxId !== survey.surveyTxId) return;
      if (parsed.endEpoch !== surveyEndEpoch) return;
      if (!parsed.powers || typeof parsed.powers !== 'object') return;
      setSnapshotStakeMap(parseSerializablePowers(parsed.powers));
      setSnapshotCapturedEpoch(typeof parsed.capturedAtEpoch === 'number' ? parsed.capturedAtEpoch : null);
    } catch {
      // Ignore malformed snapshot cache.
    }
  }, [snapshotStorageKey, survey.surveyTxId, surveyEndEpoch]);

  // Freeze stake-based voting power once the survey is closed.
  useEffect(() => {
    if (!surveyClosed || !isStakeBased || !isOnChainMode || !blockfrostClient) return;
    if (responses.length === 0) return;
    if (snapshotStakeMap) return;

    let cancelled = false;
    setStakesLoading(true);

    (async () => {
      const next = new Map<string, bigint>();
      const drepPower = new Map<string, bigint>();
      const poolPower = new Map<string, bigint>();
      const spoPower = new Map<string, bigint>();
      const stakeholderPower = new Map<string, bigint>();

      for (const resp of responses) {
        if (cancelled) return;
        const cred = resp.responseCredential;
        const role = resp.responderRole;
        let power = 0n;
        try {
          if (role === 'DRep') {
            if (drepPower.has(cred)) {
              power = drepPower.get(cred) ?? 0n;
            } else {
              const info = await blockfrostClient.getDRepInfo(cred);
              power = info && !info.retired && info.amount ? BigInt(info.amount) : 0n;
              drepPower.set(cred, power);
            }
          } else if (role === 'SPO') {
            if (cred.startsWith('pool')) {
              if (poolPower.has(cred)) {
                power = poolPower.get(cred) ?? 0n;
              } else {
                const p = await blockfrostClient.getPoolVotingPower(cred);
                power = p ?? 0n;
                poolPower.set(cred, power);
              }
            } else {
              const stakeAddress = await resolveStakeAddressForLookup(
                blockfrostClient,
                resp.voterAddress,
                cred
              );
              const cacheKey = stakeAddress ?? cred;
              if (spoPower.has(cacheKey)) {
                power = spoPower.get(cacheKey) ?? 0n;
              } else if (stakeAddress) {
                const p = await blockfrostClient.getSPOVotingPower(stakeAddress);
                power = p ?? 0n;
                spoPower.set(cacheKey, power);
              }
            }
          } else if (role === 'Stakeholder') {
            const stakeAddress = await resolveStakeAddressForLookup(
              blockfrostClient,
              resp.voterAddress,
              cred
            );
            const cacheKey = stakeAddress ?? cred;
            if (stakeholderPower.has(cacheKey)) {
              power = stakeholderPower.get(cacheKey) ?? 0n;
            } else if (stakeAddress) {
              const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
              power = accountInfo ? BigInt(accountInfo.controlled_amount) : 0n;
              stakeholderPower.set(cacheKey, power);
            }
          }
        } catch {
          power = 0n;
        }

        // Keep lookup compatibility for tallying and response table rendering.
        next.set(resp.txId, power);
        next.set(cred, power);
        if (resp.voterAddress) next.set(resp.voterAddress, power);
      }

      if (cancelled) return;
      setSnapshotStakeMap(next);
      setSnapshotCapturedEpoch(currentEpoch ?? null);
      setStakeMap(next);
      setStakesLoading(false);

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const payload: StakeSnapshotPayload = {
            version: STAKE_SNAPSHOT_VERSION,
            surveyTxId: survey.surveyTxId,
            endEpoch: surveyEndEpoch,
            capturedAtEpoch: currentEpoch ?? null,
            capturedAt: Date.now(),
            powers: mapToSerializablePowers(next),
          };
          window.localStorage.setItem(snapshotStorageKey, JSON.stringify(payload));
        } catch {
          // Best-effort persistence only.
        }
      }
    })();

    return () => { cancelled = true; };
  }, [
    surveyClosed,
    isStakeBased,
    isOnChainMode,
    blockfrostClient,
    responses,
    snapshotStakeMap,
    survey.surveyTxId,
    surveyEndEpoch,
    currentEpoch,
    snapshotStorageKey,
  ]);

  // Fetch stake amounts for unique voters when StakeBased
  useEffect(() => {
    if (surveyClosed && snapshotStakeMap) {
      setStakeMap(snapshotStakeMap);
      setStakesLoading(false);
      return;
    }

    if (!isStakeBased || filteredResponses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setStakeMap(new Map());
      return;
    }

    let cancelled = false;
    setStakesLoading(true);

    (async () => {
      const map = new Map<string, bigint>();
      for (const resp of filteredResponses) {
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
  }, [isStakeBased, filteredResponses, isOnChainMode, blockfrostClient, surveyClosed, snapshotStakeMap]);

  // Role-aware display voting power for the response list:
  // DRep/SPO => delegated power, CC => 1 vote, Stakeholder => wallet amount.
  useEffect(() => {
    if (filteredResponses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setDisplayVotingPower(new Map());
      setOneVoteCredentials(new Set());
      return;
    }

    const hasDRepRole = requiredRoles.includes('DRep');
    const hasSPORole = requiredRoles.includes('SPO');
    const hasCCRole = requiredRoles.includes('CC');
    const hasStakeholderRole = requiredRoles.includes('Stakeholder');
    const unique = new Map<string, { credential: string; voterAddress?: string; txId: string }>();
    for (const resp of filteredResponses) {
      if (!unique.has(resp.responseCredential)) {
        unique.set(resp.responseCredential, {
          credential: resp.responseCredential,
          voterAddress: resp.voterAddress,
          txId: resp.txId,
        });
      }
    }

    let cancelled = false;
    setDisplayPowerLoading(true);

    (async () => {
      const map = new Map<string, bigint>();
      const oneVote = new Set<string>();

      for (const { credential, voterAddress, txId } of unique.values()) {
        if (cancelled) return;
        try {
          let lookupAddress = voterAddress ?? '';
          if (!lookupAddress || lookupAddress === 'unknown') {
            try {
              const utxos = await blockfrostClient.getTransactionUtxos(txId);
              const txInput = utxos?.inputs?.[0]?.address;
              if (typeof txInput === 'string' && txInput.length > 0) {
                lookupAddress = txInput;
              }
            } catch {
              // best effort fallback only
            }
          }

          // Resolve stake address once and reuse across role-specific lookups.
          const stakeAddress = await resolveStakeAddressForLookup(
            blockfrostClient,
            lookupAddress,
            credential
          );

          // DRep delegated power
          if (hasDRepRole) {
            let drepPower: bigint | null = null;
            const drepInfo = await blockfrostClient.getDRepInfo(credential);
            if (drepInfo && !drepInfo.retired && drepInfo.amount) {
              drepPower = BigInt(drepInfo.amount);
            }

            // Fallback parity with voting page: controlled wallet stake amount.
            let stakePower: bigint | null = null;
            if (stakeAddress) {
              const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
              if (accountInfo) {
                stakePower = BigInt(accountInfo.controlled_amount);
              }
            }

            if (drepPower !== null && drepPower > 0n) {
              map.set(credential, drepPower);
              continue;
            }
            if (stakePower !== null) {
              map.set(credential, stakePower);
              continue;
            }
            if (drepPower !== null) {
              map.set(credential, drepPower);
              continue;
            }
          }

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
  }, [filteredResponses, isOnChainMode, blockfrostClient, requiredRoles]);

  // Resolve a role badge per credential for response-list display.
  useEffect(() => {
    if (filteredResponses.length === 0 || !isOnChainMode || !blockfrostClient) {
      setResolvedRoleByCredential(new Map());
      setResolvedCcColdByCredential(new Map());
      setResolvedSpoPoolByCredential(new Map());
      return;
    }

    const shouldCheckDRep = requiredRoles.length === 0 || requiredRoles.includes('DRep');
    const shouldCheckCC = requiredRoles.length === 0 || requiredRoles.includes('CC');
    const shouldCheckSPO = requiredRoles.length === 0 || requiredRoles.includes('SPO');
    const shouldCheckStakeholder = requiredRoles.length === 0 || requiredRoles.includes('Stakeholder');

    let cancelled = false;
    const unique = new Map<string, { credential: string; voterAddress?: string }>();
    for (const resp of filteredResponses) {
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
      const spoPoolMap = new Map<string, string>();
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
              spoPoolMap.set(credential, credential);
              continue;
            }
          }

          if (!stakeAddress) continue;

          if (shouldCheckSPO) {
            const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
            if (accountInfo?.pool_id) {
              spoPoolMap.set(credential, accountInfo.pool_id);
            }
          }

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
        setResolvedSpoPoolByCredential(spoPoolMap);
      }
    })();

    return () => { cancelled = true; };
  }, [filteredResponses, isOnChainMode, blockfrostClient, requiredRoles]);

  // UI fallback: if a stored credential is still addr..., resolve to stake...
  // so SPO/stake identities are displayed consistently in the response table.
  useEffect(() => {
    if (!isOnChainMode || !blockfrostClient || filteredResponses.length === 0) {
      setResolvedDisplayCredentialByTx(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      const next = new Map<string, string>();
      for (const resp of filteredResponses) {
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
  }, [filteredResponses, isOnChainMode, blockfrostClient]);

  const tally = useMemo(() => {
    return tallySurveyResponses(
      survey.details,
      filteredResponses,
      weighting,
      isStakeBased ? stakeMap : undefined
    );
  }, [survey.details, filteredResponses, weighting, isStakeBased, stakeMap]);

  const displayTally = useMemo(() => {
    if (!tally) return null;
    if (selectedRoleFilter !== 'all' || tally.roleTallies.length <= 1) return tally;

    const mergedByQuestion = new Map<string, {
      questionId: string;
      question: string;
      methodType: SurveyQuestion['methodType'];
      optionTallies?: { index: number; label: string; count: number; weight: number }[];
      numericValues?: number[];
      numericBins?: Map<string, number>;
      customTexts?: string[];
    }>();

    for (const q of questions) {
      mergedByQuestion.set(q.questionId, {
        questionId: q.questionId,
        question: q.question,
        methodType: q.methodType,
        optionTallies: (q.options ?? []).map((label, index) => ({ index, label, count: 0, weight: 0 })),
        numericValues: [],
        numericBins: new Map<string, number>(),
        customTexts: [],
      });
    }

    let totalWeight = 0;
    for (const roleTally of tally.roleTallies) {
      totalWeight += roleTally.totalWeight;
      for (const qt of roleTally.questionTallies) {
        const target = mergedByQuestion.get(qt.questionId);
        if (!target) continue;

        if (target.optionTallies && qt.optionTallies) {
          for (let i = 0; i < target.optionTallies.length; i++) {
            const source = qt.optionTallies[i];
            if (!source) continue;
            target.optionTallies[i].count += source.count;
            target.optionTallies[i].weight += source.weight;
          }
        }

        if (qt.numericTally) {
          target.numericValues?.push(...qt.numericTally.values);
          for (const bin of qt.numericTally.bins) {
            const prev = target.numericBins?.get(bin.range) ?? 0;
            target.numericBins?.set(bin.range, prev + bin.count);
          }
        }

        if (qt.customTexts && qt.customTexts.length > 0) {
          target.customTexts?.push(...qt.customTexts);
        }
      }
    }

    const mergedQuestions = Array.from(mergedByQuestion.values()).map((q) => {
      if (q.methodType === METHOD_NUMERIC_RANGE) {
        const values = q.numericValues ?? [];
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
        const median = values.length === 0
          ? 0
          : values.length % 2 === 0
            ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
            : sorted[Math.floor(values.length / 2)];
        const min = values.length > 0 ? sorted[0] : 0;
        const max = values.length > 0 ? sorted[sorted.length - 1] : 0;
        const bins = Array.from(q.numericBins?.entries() ?? []).map(([range, count]) => ({ range, count }));
        return {
          questionId: q.questionId,
          question: q.question,
          methodType: q.methodType,
          numericTally: { values, mean, median, min, max, bins },
        };
      }

      if (q.methodType === METHOD_SINGLE_CHOICE || q.methodType === METHOD_MULTI_SELECT) {
        return {
          questionId: q.questionId,
          question: q.question,
          methodType: q.methodType,
          optionTallies: q.optionTallies,
        };
      }

      return {
        questionId: q.questionId,
        question: q.question,
        methodType: q.methodType,
        customTexts: q.customTexts,
      };
    });

    const firstQuestion = mergedQuestions[0];
    return {
      ...tally,
      totalWeight,
      questionTallies: mergedQuestions,
      optionTallies: firstQuestion?.optionTallies,
      numericTally: firstQuestion?.numericTally,
    };
  }, [tally, selectedRoleFilter, questions]);

  const method = questions[0]?.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;
  const questionById = useMemo(
    () => new Map(questions.map((q) => [q.questionId, q])),
    [questions]
  );
  const chartGridColor = isLightTheme ? '#94a3b8' : '#1e293b';
  const chartAxisPrimary = isLightTheme ? '#334155' : '#94a3b8';
  const chartAxisSecondary = isLightTheme ? '#475569' : '#64748b';
  const tooltipBg = isLightTheme ? '#f8fafc' : '#0c0f1a';
  const tooltipBorder = isLightTheme ? '1px solid rgba(100, 116, 139, 0.35)' : '1px solid rgba(20, 184, 166, 0.2)';
  const tooltipText = isLightTheme ? '#0f172a' : '#f1f5f9';

  const displayedResponses = showAllResponses
    ? filteredResponses
    : filteredResponses.slice(0, RESPONSES_PER_PAGE);

  const latestCountedByVoter = useMemo(() => {
    const ordered = [...filteredResponses]
      .filter((r) => r.identityVerified !== false)
      .sort((a, b) => {
      if (a.slot !== b.slot) return a.slot - b.slot;
      if (a.txIndexInBlock !== b.txIndexInBlock) return a.txIndexInBlock - b.txIndexInBlock;
      return (a.metadataPosition ?? 0) - (b.metadataPosition ?? 0);
    });
    const latest = new Map<string, string>();
    for (const resp of ordered) {
      const voterKey = `${resp.responderRole}|${resp.responseCredential}`;
      latest.set(voterKey, resp.txId);
    }
    return latest;
  }, [filteredResponses]);

  const responseAuditRows = useMemo(() => {
    return filteredResponses.map((resp) => {
      const voterKey = `${resp.responderRole}|${resp.responseCredential}`;
      const unverified = resp.identityVerified === false;
      const superseded = latestCountedByVoter.get(voterKey) !== resp.txId;
      const isCounted = !unverified && !superseded;
      const power = displayVotingPower.get(resp.responseCredential);
      const value = resp.answers && resp.answers.length > 0
        ? JSON.stringify(resp.answers)
        : (resp.selection !== undefined ? resp.selection.join('|') : (resp.numericValue ?? resp.customValue ?? ''));
      return {
        txId: resp.txId,
        surveyTxId: resp.surveyTxId,
        responderRole: resp.responderRole,
        responseCredential: resp.responseCredential,
        voterAddress: resp.voterAddress ?? '',
        value,
        votingPowerLovelace: power !== undefined ? power.toString() : '',
        counted: isCounted,
        status: unverified ? 'unverified' : superseded ? 'superseded' : 'counted',
        slot: resp.slot,
        txIndexInBlock: resp.txIndexInBlock,
        utcTime: formatUtcTime(resp.timestampMs),
        exclusionReason: unverified
          ? (resp.identityVerificationReason ?? 'identity verification failed')
          : superseded
            ? 'superseded by latest valid response for (responderRole,responseCredential)'
            : '',
      };
    });
  }, [filteredResponses, latestCountedByVoter, displayVotingPower]);

  const tallySnapshotHash = useMemo(() => {
    if (!displayTally) return '';
    const counted = responseAuditRows
      .filter((r) => r.counted)
      .sort((a, b) => a.slot - b.slot || a.txIndexInBlock - b.txIndexInBlock || a.txId.localeCompare(b.txId));
    const canonical = JSON.stringify({
      surveyTxId: survey.surveyTxId,
      surveyHash: survey.surveyHash,
      weighting: displayTally.weighting,
      totalResponses: displayTally.totalResponses,
      totalWeight: displayTally.totalWeight,
      counted,
      questionTallies: displayTally.questionTallies,
      optionTallies: displayTally.optionTallies,
      numericTally: displayTally.numericTally,
    });
    const bytes = new TextEncoder().encode(canonical);
    return blake.blake2bHex(bytes, undefined, 32);
  }, [responseAuditRows, survey.surveyTxId, survey.surveyHash, displayTally]);

  const exportAuditJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      surveyTxId: survey.surveyTxId,
      surveyHash: survey.surveyHash,
      view: {
        roleFilter: selectedRoleFilter,
        canonical: !isCompositeView,
        mergePolicy: isCompositeView ? 'sum-per-role-tallies' : 'none',
        weightingInterpretation: isCompositeView
          ? 'non-canonical composite; mixed role weighting units may not be directly comparable'
          : 'canonical per-role tally',
      },
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
      'tx_id', 'survey_tx_id', 'responder_role', 'response_credential', 'voter_address', 'value',
      'voting_power_lovelace', 'counted', 'status', 'slot', 'tx_index', 'utc_time', 'exclusion_reason',
    ];
    const rows = responseAuditRows.map((r) => [
      r.txId, r.surveyTxId, r.responderRole, r.responseCredential, r.voterAddress, String(r.value),
      r.votingPowerLovelace, String(r.counted), r.status, String(r.slot), String(r.txIndexInBlock), r.utcTime, r.exclusionReason,
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((line) => line.map((c) => esc(c)).join(',')).join('\n');
    downloadTextFile(csv, `tally-audit-${survey.surveyTxId.slice(0, 12)}.csv`, 'text/csv');
  };

  // Find the leading option (by weight for StakeBased, by count otherwise)
  const leadingOption = isOptionBased && displayTally?.optionTallies
    ? displayTally.optionTallies.reduce((max, t) => {
        const metric = isStakeBased ? t.weight : t.count;
        const maxMetric = isStakeBased ? max.weight : max.count;
        return metric > maxMetric ? t : max;
      }, displayTally.optionTallies[0])
    : null;
  const optionTotalMetric = useMemo(() => {
    if (!isOptionBased || !displayTally?.optionTallies) return 0;
    return isStakeBased
      ? displayTally.optionTallies.reduce((sum, x) => sum + x.weight, 0)
      : displayTally.optionTallies.reduce((sum, x) => sum + x.count, 0);
  }, [isOptionBased, displayTally, isStakeBased]);
  const sortedOptionTallies = useMemo(() => {
    if (!isOptionBased || !displayTally?.optionTallies) return [];
    const items = [...displayTally.optionTallies];
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
  }, [isOptionBased, displayTally, optionSortMode, isStakeBased, optionTotalMetric, leadingOption]);

  if (!displayTally) {
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

  const renderResponseValue = (resp: { answers?: SurveyAnswer[]; selection?: number[]; numericValue?: number; customValue?: unknown }) => {
    const answers = resp.answers && resp.answers.length > 0
      ? resp.answers
      : [{
        questionId: 'q1',
        selection: resp.selection,
        numericValue: resp.numericValue,
        customValue: resp.customValue,
      }];
    return (
      <div className="space-y-2">
        {answers.map((answer, idx) => {
      const question = questionById.get(answer.questionId);
      const label = question?.question ?? answer.questionId;
      if (answer.selection && answer.selection.length > 0) {
        const optionLabels = answer.selection.map((idx) => question?.options?.[idx] ?? `[${idx}]`).join(', ');
            return (
              <div key={`${answer.questionId}-${idx}`}>
                <span className="font-semibold text-slate-200">{label}:</span>{' '}
                <span>{optionLabels}</span>
              </div>
            );
      }
      if (answer.numericValue !== undefined) {
            return (
              <div key={`${answer.questionId}-${idx}`}>
                <span className="font-semibold text-slate-200">{label}:</span>{' '}
                <span className="font-code">{answer.numericValue.toLocaleString()}</span>
              </div>
            );
      }
      if (answer.customValue !== undefined) {
            const markdown =
              typeof answer.customValue === 'string'
                ? answer.customValue
                : JSON.stringify(answer.customValue, null, 2);
            return (
              <div key={`${answer.questionId}-${idx}`} className="space-y-1">
                <div className="font-semibold text-slate-200">{label}:</div>
                <div className="bg-slate-900/40 border border-slate-700/30 rounded-lg p-2.5">
                  <MarkdownContent content={markdown} />
                </div>
              </div>
            );
      }
          return (
            <div key={`${answer.questionId}-${idx}`}>
              <span className="font-semibold text-slate-200">{label}:</span> -
            </div>
          );
        })}
      </div>
    );
  };

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
      {surveyClosed && snapshotStakeMap && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <Hash className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-300">
            Canonical tally locked to end-epoch snapshot
            {snapshotCapturedEpoch !== null ? ` (captured at epoch ${snapshotCapturedEpoch})` : ''}.
          </p>
        </div>
      )}
      {requiredRoles.length > 1 && (
        <div className="flex items-center justify-between gap-3 p-3 bg-slate-800/25 border border-slate-700/30 rounded-xl">
          <p className="text-xs text-slate-400 font-medium">Role filter</p>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value as RoleFilterValue)}
            className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1"
          >
            <option value="all">All roles (non-canonical)</option>
            {requiredRoles.map((role) => (
              <option key={role} value={role}>{t(`role.${role}`)}</option>
            ))}
          </select>
        </div>
      )}
      {isCompositeView && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
          Non-canonical view. Use a specific role filter for canonical results.
        </div>
      )}

      {/* Stats row */}
      <div className={`grid grid-cols-2 ${isStakeBased ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400 font-medium">{t('results.totalResponses')}</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">{displayTally.totalResponses.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400 font-medium">{t('results.uniqueVoters')}</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">
            {displayTally.uniqueCredentials.toLocaleString()}
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
              {formatAda(displayTally.totalWeight)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ADA</p>
          </div>
        )}
        {isNumeric && displayTally.numericTally && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">{t('results.median')}</span>
            </div>
            <p className="text-2xl font-bold font-code text-white">
              {displayTally.numericTally.median}
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
          {isCompositeView && (
            <li>Composite view is non-canonical and sums per-role tallies.</li>
          )}
        </ul>
        <p className="text-[11px] text-slate-500 font-code break-all">
          {t('results.snapshotHash', { hash: tallySnapshotHash })}
        </p>
      </div>

      {/* Option-based chart */}
      {isOptionBased && displayTally.optionTallies && (
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
      {isNumeric && displayTally.numericTally && (
        <div className="tally-chart-card bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-5 font-heading">
            Value Distribution
          </h4>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Mean', value: displayTally.numericTally.mean.toFixed(1), color: 'text-teal-400' },
              { label: 'Median', value: displayTally.numericTally.median.toFixed(1), color: 'text-emerald-400' },
              { label: 'Min', value: displayTally.numericTally.min, color: 'text-slate-400' },
              { label: 'Max', value: displayTally.numericTally.max, color: 'text-slate-400' },
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
          {displayTally.numericTally.bins.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={displayTally.numericTally.bins}>
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
            {t('results.total', { count: filteredResponses.length.toLocaleString() })}
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
                const hasSpoEligibility = requiredRoles.includes('SPO');
                const voterKey = `${resp.responderRole}|${resp.responseCredential}`;
                const unverified = resp.identityVerified === false;
                const superseded = latestCountedByVoter.get(voterKey) !== resp.txId;
                const isCounted = !unverified && !superseded;
                const voterLovelace = stakeMap.get(resp.txId)
                  ?? stakeMap.get(resp.responseCredential)
                  ?? (resp.voterAddress ? stakeMap.get(resp.voterAddress) : undefined);
                const role = resolvedRoleByCredential.get(resp.responseCredential);
                const ccCold = resolvedCcColdByCredential.get(resp.responseCredential);
                const spoPool = resolvedSpoPoolByCredential.get(resp.responseCredential);
                const claimedCredential = (resp.claimedCredential ?? '').trim();
                const claimedPool = claimedCredential.startsWith('pool') ? claimedCredential : null;
                const derivedStake =
                  deriveStakeFromAddress(resp.responseCredential) ??
                  deriveStakeFromAddress(resp.voterAddress ?? '') ??
                  resolvedDisplayCredentialByTx.get(resp.txId);
                const addrDisplay =
                  (resp.voterAddress?.startsWith('addr') ? resp.voterAddress : null) ??
                  (resp.responseCredential.startsWith('addr') ? resp.responseCredential : null);
                const unverifiedClaimedPool = !isCounted && claimedCredential.startsWith('pool')
                  ? claimedCredential
                  : null;
                const cred = claimedPool
                  ? claimedPool
                  : hasSpoEligibility && spoPool
                    ? spoPool
                  : role === 'SPO' || role === 'CC'
                    ? (role === 'CC'
                        ? (ccCold ?? derivedStake ?? resp.responseCredential)
                        : (unverifiedClaimedPool ?? spoPool ?? derivedStake ?? resp.responseCredential))
                    : role === 'DRep'
                      ? resp.responseCredential
                      : (addrDisplay ?? resp.responseCredential);
                const isDRepId = cred.startsWith('drep');
                const isCcCold = cred.startsWith('cc_cold');
                const isPoolId = cred.startsWith('pool');
                const explorerBase = explorerProvider === 'cexplorer'
                  ? (mode === 'mainnet' ? 'https://cexplorer.io' : 'https://preview.cexplorer.io')
                  : (mode === 'mainnet' ? 'https://cardanoscan.io' : 'https://preview.cardanoscan.io');
                const explorerUrl = isDRepId
                  ? `${explorerBase}/drep/${cred}`
                  : isPoolId
                    ? `${explorerBase}/pool/${cred}`
                  : !isCcCold
                    ? `${explorerBase}/address/${cred}`
                    : '';
                const txPower = stakeMap.get(resp.txId);
                const credPower = stakeMap.get(resp.responseCredential);
                const voterPower = resp.voterAddress ? stakeMap.get(resp.voterAddress) : undefined;
                const submitPower = (() => {
                  if (!resp.submitPowerLovelace) return undefined;
                  try {
                    return BigInt(resp.submitPowerLovelace);
                  } catch {
                    return undefined;
                  }
                })();
                const resolvedPower = isStakeBased
                  ? (txPower ?? credPower ?? voterPower ?? submitPower ?? displayVotingPower.get(resp.responseCredential))
                  : (submitPower ?? displayVotingPower.get(resp.responseCredential));
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
                      {renderResponseValue(resp)}
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
        {filteredResponses.length > RESPONSES_PER_PAGE && (
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
                  {t('results.showAllResponses', { count: filteredResponses.length })}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
