/**
 * Eligibility Hook
 *
 * Checks whether the connected wallet holds the required on-chain roles
 * to participate in a survey (DRep, SPO, CC, Stakeholder).
 *
 * Also fetches voting power (ADA balance) for display purposes.
 *
 * Uses Blockfrost API lookups via BlockfrostClient to verify roles
 * against the wallet's stake (reward) address.
 */
import { useState, useEffect, useCallback } from 'react';
import { BrowserWallet } from '@meshsdk/core';
import * as blake from 'blakejs';
import { useApp } from '../context/AppContext.tsx';
import type { EligibilityRole } from '../types/survey.ts';

// ─── Bech32 encoding helpers ─────────────────────────────────────────
// Minimal bech32 encoder to convert hex stake addresses to bech32.
// Mesh's getRewardAddresses() returns hex; Blockfrost needs bech32.

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
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

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function bytesToFiveBit(data: Uint8Array): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      ret.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) ret.push((acc << (5 - bits)) & 31);
  return ret;
}

function bech32Encode(hrp: string, data: Uint8Array): string {
  const fiveBit = bytesToFiveBit(data);
  const checksum = bech32CreateChecksum(hrp, fiveBit);
  let ret = hrp + '1';
  for (const d of fiveBit.concat(checksum)) ret += BECH32_CHARSET[d];
  return ret;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function normalizeDRepId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Convert a hex-encoded stake/reward address to bech32.
 * Header byte e0 = testnet stake address, e1 = mainnet stake address.
 */
function hexStakeAddressToBech32(hex: string): string {
  const bytes = hexToBytes(hex);
  // First byte is the header: e0 = testnet, e1 = mainnet
  const header = bytes[0];
  const hrp = (header & 0x0f) === 0 ? 'stake_test' : 'stake';
  return bech32Encode(hrp, bytes);
}

export interface EligibilityState {
  /** Whether the check is in progress */
  checking: boolean;
  /** The roles the connected wallet holds */
  walletRoles: EligibilityRole[];
  /** The stake/reward address used for the check */
  stakeAddress: string | null;
  /** Whether the wallet meets the survey's eligibility requirements */
  eligible: boolean;
  /** Which required roles the wallet is missing */
  missingRoles: EligibilityRole[];
  /** Wallet's voting power in lovelace (1 ADA = 1,000,000 lovelace) */
  votingPowerLovelace: bigint | null;
  /** Active DRep ID detected from wallet (if any) */
  drepId: string | null;
  /** Error message if something went wrong */
  error: string | null;
}

const INITIAL_STATE: EligibilityState = {
  checking: false,
  walletRoles: [],
  stakeAddress: null,
  eligible: true,
  missingRoles: [],
  votingPowerLovelace: null,
  drepId: null,
  error: null,
};

/**
 * Hook that checks the connected wallet's eligibility for a survey
 * and fetches voting power.
 *
 * @param requiredRoles - The roles required by the survey's `eligibility` field.
 *   If empty/undefined, the wallet is always eligible (open survey).
 */
export function useEligibility(requiredRoles?: EligibilityRole[]) {
  const { blockfrostClient, wallet } = useApp();
  const [state, setState] = useState<EligibilityState>(INITIAL_STATE);

  const hasRestrictions = requiredRoles && requiredRoles.length > 0;
  const requiresDRep = requiredRoles?.includes('DRep') ?? false;
  const stakeholderOnly = (requiredRoles?.length ?? 0) === 1 && requiredRoles?.[0] === 'Stakeholder';

  const checkEligibility = useCallback(async () => {
    // No wallet connected — can't check anything
    if (!wallet.connectedWallet) {
      setState({
        ...INITIAL_STATE,
        eligible: !hasRestrictions,
        missingRoles: hasRestrictions ? requiredRoles! : [],
        error: hasRestrictions
          ? 'Wallet not connected'
          : null,
      });
      return;
    }

    // Stakeholder-only surveys: no role-proof checks required.
    // If wallet is connected, allow voting. Fetch stake/voting power best-effort.
    if (stakeholderOnly) {
      setState((prev) => ({ ...prev, checking: true, error: null }));
      try {
        let browserWallet: BrowserWallet;
        try {
          browserWallet = await BrowserWallet.enable(wallet.connectedWallet.id);
        } catch {
          browserWallet = await BrowserWallet.enable(wallet.connectedWallet.id);
        }

        let rewardAddresses: string[] = [];
        try {
          rewardAddresses = await (browserWallet as any).getRewardAddressesBech32?.()
            ?? await browserWallet.getRewardAddresses();
        } catch {
          rewardAddresses = await browserWallet.getRewardAddresses();
        }

        let stakeAddress: string | null = rewardAddresses?.[0] ?? null;
        if (stakeAddress && !stakeAddress.startsWith('stake') && /^[0-9a-fA-F]+$/.test(stakeAddress)) {
          stakeAddress = hexStakeAddressToBech32(stakeAddress);
        }

        let votingPowerLovelace: bigint | null = null;
        if (blockfrostClient && stakeAddress) {
          try {
            const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
            if (accountInfo) votingPowerLovelace = BigInt(accountInfo.controlled_amount);
          } catch {
            // Best-effort only for Stakeholder path.
          }
        }

        setState({
          checking: false,
          walletRoles: ['Stakeholder'],
          stakeAddress,
          eligible: true,
          missingRoles: [],
          votingPowerLovelace,
          drepId: null,
          error: null,
        });
      } catch {
        // Even if wallet reward lookup fails, keep Stakeholder path unblocked.
        setState({
          checking: false,
          walletRoles: ['Stakeholder'],
          stakeAddress: null,
          eligible: true,
          missingRoles: [],
          votingPowerLovelace: null,
          drepId: null,
          error: null,
        });
      }
      return;
    }

    if (!blockfrostClient) {
      setState({
        ...INITIAL_STATE,
        eligible: !hasRestrictions,
        missingRoles: hasRestrictions ? requiredRoles! : [],
        error: hasRestrictions ? 'Blockfrost not configured' : null,
      });
      return;
    }

    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      // Get the wallet's reward (stake) addresses via Mesh BrowserWallet
      // Use getBech32 variant — Blockfrost requires bech32 (stake_test1...) format
      let browserWallet: BrowserWallet;
      try {
        // Explicitly request CIP-95 when DRep eligibility is needed.
        browserWallet = await BrowserWallet.enable(
          wallet.connectedWallet.id,
          requiresDRep ? [{ cip: 95 } as any] : undefined
        );
      } catch {
        // Fallback for wallets that reject explicit extension requests.
        browserWallet = await BrowserWallet.enable(wallet.connectedWallet.id);
      }
      let rewardAddresses: string[];
      try {
        // Prefer bech32 — Blockfrost needs stake_test1... / stake1... format
        rewardAddresses = await (browserWallet as any).getRewardAddressesBech32?.()
          ?? await browserWallet.getRewardAddresses();
      } catch {
        rewardAddresses = await browserWallet.getRewardAddresses();
      }
      console.log('[Eligibility] Raw reward addresses from Mesh:', rewardAddresses);

      if (!rewardAddresses || rewardAddresses.length === 0) {
        setState({
          ...INITIAL_STATE,
          checking: false,
          eligible: !hasRestrictions,
          missingRoles: hasRestrictions ? requiredRoles! : [],
          error: hasRestrictions
            ? 'No stake/reward address found. Is your wallet registered on-chain?'
            : null,
        });
        return;
      }

      let stakeAddress = rewardAddresses[0];

      // If Mesh returned hex instead of bech32, convert it.
      // Hex reward addresses are 58 hex chars (29 bytes: 1 header + 28 credential).
      // Bech32 starts with "stake" prefix.
      if (!stakeAddress.startsWith('stake') && /^[0-9a-fA-F]+$/.test(stakeAddress)) {
        // Use Blockfrost to resolve: query an address lookup won't work for stake hex,
        // so we bech32-encode it ourselves.
        const converted = hexStakeAddressToBech32(stakeAddress);
        console.log('[Eligibility] Converted hex→bech32:', stakeAddress, '→', converted);
        stakeAddress = converted;
      }
      console.log('[Eligibility] Final stake address:', stakeAddress);

      // Always fetch voting power (controlled ADA amount)
      let votingPowerLovelace: bigint | null = null;
      try {
        const accountInfo = await blockfrostClient.getAccountInfo(stakeAddress);
        if (accountInfo) {
          votingPowerLovelace = BigInt(accountInfo.controlled_amount);
        }
      } catch {
        // Non-critical — voting power display is informational
      }

      // If no restrictions, everyone is eligible — just return voting power
      if (!hasRestrictions) {
        setState({
          checking: false,
          walletRoles: [],
          stakeAddress,
          eligible: true,
          missingRoles: [],
          votingPowerLovelace,
          drepId: null,
          error: null,
        });
        return;
      }

      // For DRep check: gather candidate IDs directly from wallet via CIP-95.
      // Different wallets expose different DRep formats (cip105/bech32/hash).
      const walletDRepIds = new Set<string>();
      let dRepCapabilityError: string | null = null;
      let matchedWalletDRepId: string | null = null;
      if (requiredRoles!.includes('DRep')) {
        let enabledExtensions: number[] = [];
        try {
          enabledExtensions = await browserWallet.getExtensions();
          console.log('[Eligibility] Enabled wallet extensions:', enabledExtensions);
        } catch {
          // Non-critical
        }

        let drepPubKeyHex: string | undefined;
        try {
          // CIP-95: getPubDRepKey returns the DRep public key hex
          drepPubKeyHex = await (browserWallet as any).getPubDRepKey();
          console.log('[Eligibility] DRep pub key from wallet:', drepPubKeyHex);
        } catch (e) {
          console.log('[Eligibility] CIP-95 getPubDRepKey not supported by wallet:', e);
        }

        try {
          const drepObj = await (browserWallet as any).getDRep();
          console.log('[Eligibility] getDRep() result:', drepObj);
          if (typeof drepObj === 'string') {
            const id = normalizeDRepId(drepObj);
            if (id) walletDRepIds.add(id);
          } else if (drepObj && typeof drepObj === 'object') {
            const candidateFields = [
              drepObj.dRepIDCip105,
              drepObj.dRepIDBech32,
              drepObj.dRepIDHash,
              drepObj.drepId,
              drepObj.dRepId,
            ];
            for (const field of candidateFields) {
              const id = normalizeDRepId(field);
              if (id) walletDRepIds.add(id);
            }
          }
        } catch (e) {
          console.log('[Eligibility] getDRep() not available:', e);
        }

        // Deterministic fallback: DRep key hash = blake2b-224(pubDRepKey).
        // Blockfrost accepts hex credential hash for /governance/dreps/{drepId}.
        const cleanPubKeyHex = normalizeDRepId(drepPubKeyHex)?.replace(/^0x/i, '');
        if (cleanPubKeyHex && /^[0-9a-fA-F]+$/.test(cleanPubKeyHex) && cleanPubKeyHex.length % 2 === 0) {
          try {
            const drepKeyHashHex = blake.blake2bHex(hexToBytes(cleanPubKeyHex), undefined, 28).toLowerCase();
            walletDRepIds.add(drepKeyHashHex);
            console.log('[Eligibility] Derived DRep key hash from pub key:', drepKeyHashHex);
          } catch (e) {
            console.log('[Eligibility] Failed deriving DRep key hash from pub key:', e);
          }
        }

        console.log('[Eligibility] Candidate DRep IDs:', Array.from(walletDRepIds));

        if (walletDRepIds.size === 0) {
          const has95 = enabledExtensions.includes(95);
          dRepCapabilityError = has95
            ? 'Connected wallet/account does not expose a DRep key. Ensure you selected the DRep account and reconnect.'
            : 'Connected wallet does not expose CIP-95 (DRep key access). Use a CIP-95 compatible wallet/account and reconnect.';
        }
      }

      const isWalletDRep = async (): Promise<boolean | null> => {
        if (!requiredRoles!.includes('DRep')) return null;
        if (walletDRepIds.size === 0) return false;

        for (const candidateId of walletDRepIds) {
          if (await blockfrostClient.isDRep(candidateId)) {
            matchedWalletDRepId = candidateId;
            return true;
          }
        }
        return false;
      };

      // Check each required role in parallel
      const roleChecks = await Promise.allSettled([
        isWalletDRep(),
        requiredRoles!.includes('SPO')
          ? blockfrostClient.isSPO(stakeAddress)
          : Promise.resolve(null),
        requiredRoles!.includes('CC')
          ? blockfrostClient.isCCMember(stakeAddress)
          : Promise.resolve(null),
        requiredRoles!.includes('Stakeholder')
          ? blockfrostClient.isStakeholder(stakeAddress)
          : Promise.resolve(null),
      ]);

      // Map results back to role names
      const roleMap: [EligibilityRole, PromiseSettledResult<boolean | null>][] = [
        ['DRep', roleChecks[0]],
        ['SPO', roleChecks[1]],
        ['CC', roleChecks[2]],
        ['Stakeholder', roleChecks[3]],
      ];

      const detectedRoles: EligibilityRole[] = [];
      for (const [role, result] of roleMap) {
        if (result.status === 'fulfilled' && result.value === true) {
          detectedRoles.push(role);
        }
      }

      // The survey requires ANY of the listed roles (OR logic, not AND)
      const isEligible = requiredRoles!.some((role) => detectedRoles.includes(role));
      const missing = requiredRoles!.filter((role) => !detectedRoles.includes(role));

      setState({
        checking: false,
        walletRoles: detectedRoles,
        stakeAddress,
        eligible: isEligible,
        missingRoles: missing,
        votingPowerLovelace,
        drepId: matchedWalletDRepId,
        error: !isEligible && requiresDRep ? dRepCapabilityError : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Eligibility check failed';
      setState({
        checking: false,
        walletRoles: [],
        stakeAddress: null,
        eligible: false,
        missingRoles: hasRestrictions ? requiredRoles! : [],
        votingPowerLovelace: null,
        drepId: null,
        error: message,
      });
    }
  }, [requiredRoles, hasRestrictions, requiresDRep, stakeholderOnly, wallet.connectedWallet, blockfrostClient]);

  // Re-check whenever wallet or required roles change
  useEffect(() => {
    checkEligibility();
  }, [checkEligibility]);

  return {
    ...state,
    recheck: checkEligibility,
  };
}
