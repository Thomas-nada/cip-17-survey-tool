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
import { useApp } from '../context/AppContext.tsx';
import type { EligibilityRole } from '../types/survey.ts';

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
  const { blockfrostClient, wallet, mode } = useApp();
  const [state, setState] = useState<EligibilityState>(INITIAL_STATE);

  const hasRestrictions = requiredRoles && requiredRoles.length > 0;

  const checkEligibility = useCallback(async () => {
    // Simulated mode — skip all checks
    if (mode === 'simulated') {
      setState({ ...INITIAL_STATE, eligible: true });
      return;
    }

    // No wallet connected — can't check anything
    if (!wallet.connectedWallet || !blockfrostClient) {
      setState({
        ...INITIAL_STATE,
        eligible: !hasRestrictions,
        missingRoles: hasRestrictions ? requiredRoles! : [],
        error: hasRestrictions
          ? !wallet.connectedWallet ? 'Wallet not connected' : 'Blockfrost not configured'
          : null,
      });
      return;
    }

    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      // Get the wallet's reward (stake) addresses via Mesh BrowserWallet
      const browserWallet = await BrowserWallet.enable(wallet.connectedWallet.id);
      const rewardAddresses = await browserWallet.getRewardAddresses();

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

      const stakeAddress = rewardAddresses[0];

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
          error: null,
        });
        return;
      }

      // Check each required role in parallel
      const roleChecks = await Promise.allSettled([
        requiredRoles!.includes('DRep')
          ? blockfrostClient.isDRep(stakeAddress)
          : Promise.resolve(null),
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
        error: null,
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
        error: message,
      });
    }
  }, [requiredRoles, hasRestrictions, wallet.connectedWallet, blockfrostClient, mode]);

  // Re-check whenever wallet or required roles change
  useEffect(() => {
    checkEligibility();
  }, [checkEligibility]);

  return {
    ...state,
    recheck: checkEligibility,
  };
}
