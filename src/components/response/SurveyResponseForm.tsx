import { useState, useMemo, useEffect } from 'react';
import { Send, AlertCircle, CheckCircle2, ChevronDown, Wallet, ShieldCheck, ShieldX, Loader2, RefreshCw, Zap, Terminal, Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { checkSignature } from '@meshsdk/core';
import * as coreCst from '@meshsdk/core-cst';
import { useApp } from '../../context/AppContext.tsx';
import { useI18n } from '../../context/I18nContext.tsx';
import { useEligibility } from '../../hooks/useEligibility.ts';
import { validateSurveyResponse } from '../../utils/validation.ts';
import { SPEC_VERSION } from '../../constants/methodTypes.ts';
import { buildCopyContent, getUserPreferences } from '../../utils/userPreferences.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey, SurveyResponse, EligibilityRole } from '../../types/survey.ts';

interface Props {
  survey: StoredSurvey;
  onSubmitted?: () => void;
}

/** Format lovelace (bigint) to a human-readable ADA string */
function formatAda(lovelace: bigint): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bech32DecodeRaw(str: string): Uint8Array | null {
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SurveyResponseForm({ survey, onSubmitted }: Props) {
  const { blockchain, dispatch, mode, wallet, blockfrostClient } = useApp();
  const { t } = useI18n();
  const { details } = survey;
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';

  // Eligibility check
  const eligibility = useEligibility(details.eligibility);
  const hasEligibilityRestrictions = Boolean(details.eligibility && details.eligibility.length > 0);

  // Response state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [numericValue, setNumericValue] = useState<number>(
    details.numericConstraints?.minValue ?? 0
  );
  const [submitting, setSubmitting] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [cliMode, setCliMode] = useState(false);
  const [cliCredential, setCliCredential] = useState('');
  const [cliChecking, setCliChecking] = useState(false);
  const [cliEligible, setCliEligible] = useState(false);
  const [cliMissingRoles, setCliMissingRoles] = useState<EligibilityRole[]>([]);
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliWalletRoles, setCliWalletRoles] = useState<EligibilityRole[]>([]);
  const [cliProofKey, setCliProofKey] = useState('');
  const [cliProofSignature, setCliProofSignature] = useState('');
  const [cliProofChecking, setCliProofChecking] = useState(false);
  const [cliProofValidated, setCliProofValidated] = useState(false);
  const [cliProofMessage, setCliProofMessage] = useState<string | null>(null);
  const [lastSubmittedTxId, setLastSubmittedTxId] = useState<string | null>(null);
  const [showAdvancedCli, setShowAdvancedCli] = useState(false);
  const [prefs, setPrefs] = useState(() => getUserPreferences());

  const method = details.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;
  const roleLabel = (role: EligibilityRole) => t(`role.${role}`);

  // Build response object
  const response = useMemo((): SurveyResponse => {
    const base: SurveyResponse = {
      specVersion: SPEC_VERSION,
      surveyTxId: survey.surveyTxId,
      surveyHash: survey.surveyHash,
    };

    if (isOptionBased) {
      base.selection = selectedIndices;
    } else if (isNumeric) {
      base.numericValue = numericValue;
    }

    return base;
  }, [survey, selectedIndices, numericValue, isOptionBased, isNumeric]);

  const validation = useMemo(
    () => validateSurveyResponse(response, details),
    [response, details]
  );

  const requiredRoles = details.eligibility ?? [];
  const stakeholderOnlySurvey =
    requiredRoles.length === 1 && requiredRoles[0] === 'Stakeholder';
  const openSurvey = requiredRoles.length === 0;
  const ccSpoOnlySurvey =
    requiredRoles.length > 0 &&
    requiredRoles.every((r) => r === 'CC' || r === 'SPO');
  const forceCliOnlySurvey = requiredRoles.includes('CC') || requiredRoles.includes('SPO');
  const hasWalletVotingPath = Boolean(wallet.connectedWallet && !forceCliOnlySurvey);

  const effectiveCredential = useMemo(() => {
    if (cliMode && (!wallet.connectedWallet || forceCliOnlySurvey)) return cliCredential.trim();
    if (eligibility.drepId && eligibility.walletRoles.includes('DRep')) return eligibility.drepId;
    return undefined;
  }, [cliMode, cliCredential, wallet.connectedWallet, forceCliOnlySurvey, eligibility.drepId, eligibility.walletRoles]);
  const cliProofRole = useMemo(() => {
    const credential = (effectiveCredential ?? '').trim();
    if (!cliMode || !credential) return null;
    if (credential.startsWith('drep') && requiredRoles.includes('DRep')) return 'DRep';
    if (credential.startsWith('cc_cold') && requiredRoles.includes('CC')) return 'CC';
    if ((credential.startsWith('stake') || credential.startsWith('addr') || credential.startsWith('pool')) && requiredRoles.includes('SPO')) return 'SPO';
    return null;
  }, [cliMode, effectiveCredential, requiredRoles]);

  const cliPayload = useMemo(() => ({
    17: {
      msg: [`Response to ${survey.details.title}`],
      surveyResponse: {
        ...response,
        ...(effectiveCredential ? { responseCredential: effectiveCredential } : {}),
        ...(cliMode && effectiveCredential && cliProofKey.trim() && cliProofSignature.trim()
          ? {
              proof: {
                message: JSON.stringify({
                  surveyTxId: response.surveyTxId,
                  surveyHash: response.surveyHash,
                  responseCredential: effectiveCredential,
                  response: {
                    selection: response.selection,
                    numericValue: response.numericValue,
                    customValue: response.customValue,
                  },
                }),
                key: cliProofKey.trim(),
                signature: cliProofSignature.trim(),
                scheme: 'ed25519',
              },
            }
          : {}),
      },
    },
  }), [response, survey.details.title, effectiveCredential, cliMode, cliProofKey, cliProofSignature]);

  const cliPayloadJson = useMemo(
    () => JSON.stringify(cliPayload, null, 2),
    [cliPayload]
  );
  const proofChallenge = useMemo(() => {
    if (!effectiveCredential) return '';
    return JSON.stringify({
      surveyTxId: response.surveyTxId,
      surveyHash: response.surveyHash,
      responseCredential: effectiveCredential,
      response: {
        selection: response.selection,
        numericValue: response.numericValue,
        customValue: response.customValue,
      },
    });
  }, [effectiveCredential, response]);

  const cliMetadataFilename = useMemo(
    () => `vote-metadata-${survey.surveyTxId.slice(0, 10)}.json`,
    [survey.surveyTxId]
  );

  const cliCommandTemplate = useMemo(() => {
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return [
      `# 1) Save metadata JSON as ./${cliMetadataFilename}`,
      `# 2) Set your own tx-in/change/keys and build, sign, submit`,
      `cardano-cli transaction build \\`,
      `  ${netFlag} \\`,
      `  --tx-in <TX_IN> \\`,
      `  --change-address <YOUR_CHANGE_ADDRESS> \\`,
      `  --metadata-json-file ./${cliMetadataFilename} \\`,
      `  --out-file vote.txbody`,
      ``,
      `cardano-cli transaction sign \\`,
      `  --tx-body-file vote.txbody \\`,
      `  --signing-key-file <PAYMENT_SKEY_FILE> \\`,
      `  ${netFlag} \\`,
      `  --out-file vote.tx`,
      ``,
      `cardano-cli transaction submit ${netFlag} --tx-file vote.tx`,
    ].join('\n');
  }, [cliMetadataFilename, mode]);
  const copyVoteMetadataText = useMemo(
    () => buildCopyContent(prefs.copyFormat, cliPayload, cliCommandTemplate),
    [prefs.copyFormat, cliPayload, cliCommandTemplate]
  );

  const cliBuildOnlyTemplate = useMemo(() => {
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return [
      `cardano-cli transaction build \\`,
      `  ${netFlag} \\`,
      `  --tx-in <TX_IN_1> \\`,
      `  --tx-in <TX_IN_2_OPTIONAL> \\`,
      `  --change-address <FEE_PAYER_CHANGE_ADDRESS> \\`,
      `  --metadata-json-file ./${cliMetadataFilename} \\`,
      `  --out-file vote.txbody`,
    ].join('\n');
  }, [cliMetadataFilename, mode]);

  const cliWitnessTemplate = useMemo(() => {
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return [
      `# Each signer runs this separately`,
      `cardano-cli transaction witness \\`,
      `  ${netFlag} \\`,
      `  --tx-body-file vote.txbody \\`,
      `  --signing-key-file <SIGNER_SKEY_FILE> \\`,
      `  --out-file <SIGNER_NAME>.witness`,
    ].join('\n');
  }, [mode]);

  const cliAssembleTemplate = useMemo(() => {
    return [
      `# Coordinator assembles all witnesses, including fee payer`,
      `cardano-cli transaction assemble \\`,
      `  --tx-body-file vote.txbody \\`,
      `  --witness-file fee-payer.witness \\`,
      `  --witness-file signer-1.witness \\`,
      `  --witness-file signer-2.witness \\`,
      `  --out-file vote.tx`,
    ].join('\n');
  }, []);

  const cliSubmitTemplate = useMemo(() => {
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return `cardano-cli transaction submit ${netFlag} --tx-file vote.tx`;
  }, [mode]);

  const cliProofValidationCommand = useMemo(() => {
    if (!effectiveCredential?.startsWith('drep')) return '';
    const payload = JSON.stringify({
      network: mode,
      claimedDrepId: effectiveCredential,
      message: proofChallenge,
      key: cliProofKey.trim(),
      signature: cliProofSignature.trim(),
    });
    return `curl -s -X POST http://localhost:8787/api/proof/validate -H "Content-Type: application/json" -d '${payload}'`;
  }, [effectiveCredential, mode, proofChallenge, cliProofKey, cliProofSignature]);

  const verifyVoteCommand = useMemo(() => {
    if (!lastSubmittedTxId) return '';
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return `cardano-cli query tx ${netFlag} --tx-id ${lastSubmittedTxId}`;
  }, [lastSubmittedTxId, mode]);

  const cliHelperScriptFilename = useMemo(
    () => `vote-helper-${survey.surveyTxId.slice(0, 10)}.sh`,
    [survey.surveyTxId]
  );

  const cliHelperScript = useMemo(() => {
    return [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      `METADATA_FILE="${cliMetadataFilename}"`,
      '',
      "cat > \"$METADATA_FILE\" <<'JSON'",
      cliPayloadJson,
      'JSON',
      '',
      'echo "Wrote $METADATA_FILE"',
      'echo',
      'echo "Next commands:"',
      cliCommandTemplate,
      '',
    ].join('\n');
  }, [cliMetadataFilename, cliPayloadJson, cliCommandTemplate]);

  const resetCliProofStatus = () => {
    setCliProofValidated(false);
    setCliProofMessage(null);
  };

  const buildProofChallenge = () => {
    return proofChallenge;
  };

  const validateCliProof = async () => {
    const credential = effectiveCredential ?? '';
    if (!cliProofRole) {
      setCliProofValidated(false);
      setCliProofMessage('Proof validation is only required for DRep/CC/SPO credentials.');
      return;
    }
    if (!blockfrostClient) {
      setCliProofValidated(false);
      setCliProofMessage(t('common.blockfrostNotConfigured'));
      return;
    }
    const message = buildProofChallenge();
    const key = cliProofKey.trim();
    const signature = cliProofSignature.trim();
    if (!key || !signature) {
      setCliProofValidated(false);
      setCliProofMessage(t('vote.pasteProofKeySig'));
      return;
    }

    setCliProofChecking(true);
    try {
      const signatureOk = await checkSignature(message, { key, signature });
      if (!signatureOk) {
        setCliProofValidated(false);
        setCliProofMessage('Signature check failed.');
        return;
      }

      if (cliProofRole === 'DRep') {
        const pubKeyBytes = coreCst.getPublicKeyFromCoseKey(key);
        const pubKeyHex = Array.from(pubKeyBytes as Uint8Array)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const ids = coreCst.getDRepIds(pubKeyHex) as { cip105?: string; cip129?: string };
        if (ids.cip105 !== credential && ids.cip129 !== credential) {
          setCliProofValidated(false);
          setCliProofMessage('Proof key does not derive the claimed DRep ID.');
          return;
        }

        const registered = await blockfrostClient.isDRep(credential);
        if (!registered) {
          setCliProofValidated(false);
          setCliProofMessage('Claimed DRep is not registered on-chain.');
          return;
        }
      }

      setCliProofValidated(true);
      setCliProofMessage('Proof validated.');
    } catch (err) {
      setCliProofValidated(false);
      setCliProofMessage(err instanceof Error ? err.message : t('vote.drepProofValidationFailed'));
    } finally {
      setCliProofChecking(false);
    }
  };

  useEffect(() => {
    if (cliProofValidated) {
      setCliProofValidated(false);
      setCliProofMessage(t('vote.payloadChangedRevalidate'));
    }
  }, [proofChallenge]);

  useEffect(() => {
    if (wallet.connectedWallet && cliMode && !forceCliOnlySurvey) {
      setCliMode(false);
    }
  }, [wallet.connectedWallet, cliMode, forceCliOnlySurvey]);

  useEffect(() => {
    if (forceCliOnlySurvey && !cliMode) {
      setCliMode(true);
    }
  }, [forceCliOnlySurvey, cliMode]);

  useEffect(() => {
    const apply = () => setPrefs(getUserPreferences());
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

  const downloadCliMetadata = () => {
    const blob = new Blob([cliPayloadJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cliMetadataFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadCliHelperScript = () => {
    const blob = new Blob([cliHelperScript], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cliHelperScriptFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const resolveStakeAddress = async (value: string): Promise<string | null> => {
    const trimmed = value.trim();
    if (!trimmed || !blockfrostClient) return null;
    if (trimmed.startsWith('stake')) return trimmed;
    if (trimmed.startsWith('addr')) {
      const addrInfo = await blockfrostClient.getAddressInfo(trimmed);
      return addrInfo?.stake_address ?? null;
    }
    return null;
  };

  const extractCcColdHash = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('cc_cold')) return null;
    const decoded = bech32DecodeRaw(trimmed);
    if (!decoded || decoded.length < 29) return null;
    const body = decoded.slice(1, 29);
    if (body.length !== 28) return null;
    return bytesToHex(body);
  };

  const checkCliEligibility = async () => {
    const required = details.eligibility ?? [];
    const trimmed = cliCredential.trim();
    if (!trimmed) {
      setCliError(t('vote.enterCredential'));
      setCliEligible(false);
      setCliMissingRoles(required);
      return;
    }
    const isStakeholderOnly = required.length === 1 && required[0] === 'Stakeholder';
    const isOpenSurvey = required.length === 0;

    // For ADA-holder/open CLI votes we only need a claimed payment address.
    // Canonical verification is done later by matching claimed addr to tx signer.
    if (isStakeholderOnly || isOpenSurvey) {
      const isAddrCredential = trimmed.startsWith('addr');
      setCliEligible(isAddrCredential);
      setCliWalletRoles(isStakeholderOnly ? ['Stakeholder'] : []);
      setCliMissingRoles(isAddrCredential ? [] : (isStakeholderOnly ? ['Stakeholder'] : []));
      setCliError(isAddrCredential ? null : 'For this voting path, claimed credential must be an addr... payment address.');
      return;
    }

    if (!blockfrostClient) {
      setCliError(t('common.blockfrostNotConfigured'));
      return;
    }

    setCliChecking(true);
    setCliError(null);
    try {
      const stakeAddress = await resolveStakeAddress(trimmed);
      const ccHash = extractCcColdHash(trimmed);

      const checks: Record<EligibilityRole, boolean> = {
        DRep: required.includes('DRep') ? await blockfrostClient.isDRep(trimmed) : false,
        SPO: required.includes('SPO')
          ? trimmed.startsWith('pool')
            ? await blockfrostClient.isActivePool(trimmed)
            : stakeAddress
              ? await blockfrostClient.isSPO(stakeAddress)
              : false
          : false,
        CC: required.includes('CC')
          ? ccHash
            ? await blockfrostClient.isCCMemberByHash(ccHash)
            : stakeAddress
              ? await blockfrostClient.isCCMember(stakeAddress)
              : false
          : false,
        Stakeholder: required.includes('Stakeholder') && stakeAddress ? await blockfrostClient.isStakeholder(stakeAddress) : false,
      };

      const roles = (Object.keys(checks) as EligibilityRole[]).filter((r) => checks[r]);
      const eligible = required.some((r) => roles.includes(r));
      const missing = required.filter((r) => !roles.includes(r));

      setCliWalletRoles(roles);
      setCliEligible(eligible);
      setCliMissingRoles(missing);

      if (!eligible) {
        if (!stakeAddress && !trimmed.startsWith('pool') && required.some((r) => r !== 'DRep')) {
          setCliError(t('vote.provideWalletForRoleChecks'));
        } else {
          setCliError(null);
        }
      }
    } catch (err) {
      setCliError(err instanceof Error ? err.message : t('vote.cliEligibilityCheckFailed'));
      setCliEligible(false);
    } finally {
      setCliChecking(false);
    }
  };

  // Toggle option selection
  const toggleOption = (index: number) => {
    if (method === METHOD_SINGLE_CHOICE) {
      setSelectedIndices([index]);
    } else {
      setSelectedIndices((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        }
        if (
          details.maxSelections &&
          prev.length >= details.maxSelections
        ) {
          toast.error(t('vote.maxSelectionsAllowed', { count: details.maxSelections ?? 0 }));
          return prev;
        }
        return [...prev, index];
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validation.valid) {
      toast.error(t('vote.fixValidationErrors'));
      return;
    }

    setSubmitting(true);
    try {
      const msg = [`Response to ${survey.details.title}`];
      if (cliMode && (!wallet.connectedWallet || forceCliOnlySurvey)) {
        if (cliProofRole && !cliProofValidated) {
          toast.error(t('vote.validateDrepBeforeCli'));
          return;
        }
        await navigator.clipboard.writeText(copyVoteMetadataText);
        toast.success(t('vote.cliMetadataCopiedSubmitRefresh'), {
          duration: 4000,
        });
        return;
      }
      if (prefs.confirmBeforeVoteSubmit) {
        const confirmed = window.confirm('Submit this vote now?');
        if (!confirmed) return;
      }

      const responseForSubmission = effectiveCredential
        ? { ...response, responseCredential: effectiveCredential }
        : response;
      const result = await blockchain.submitResponse(responseForSubmission, msg);
      setLastSubmittedTxId(result.txId);

      dispatch({
        type: 'RESPONSE_SUBMITTED',
        payload: {
          surveyTxId: survey.surveyTxId,
          response: {
            txId: result.txId,
            responseCredential: result.responseCredential,
            claimedCredential: effectiveCredential ?? result.responseCredential,
            identityVerified: true,
            timestampMs: Date.now(),
            surveyTxId: survey.surveyTxId,
            surveyHash: survey.surveyHash,
            selection: response.selection,
            numericValue: response.numericValue,
            slot: Math.floor(Date.now() / 1000), // provisional until chain refresh
            txIndexInBlock: 0,
          },
        },
      });

      toast.success(t('vote.responseSubmitted'), {
        icon: '\u2705',
        duration: 3000,
      });
      setSelectedIndices([]);
      onSubmitted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fadeIn">
      {/* Question card */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-2 font-heading">
          {details.question}
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">{details.description}</p>
        {method === METHOD_MULTI_SELECT && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20">
              {t('vote.selectUpTo', { count: details.maxSelections ?? 0 })}
            </span>
            {selectedIndices.length > 0 && (
              <span className="text-xs text-slate-500">
                {selectedIndices.length} / {details.maxSelections} selected
              </span>
            )}
          </div>
        )}
        {method === METHOD_SINGLE_CHOICE && (
          <div className="mt-3">
            <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20">
              {t('vote.chooseOneOption')}
            </span>
          </div>
        )}
      </div>

      {/* Option-based input */}
      {isOptionBased && details.options && (
        <div className="space-y-2">
          {details.options.map((opt, index) => {
            const selected = selectedIndices.includes(index);
            const isRadio = method === METHOD_SINGLE_CHOICE;
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleOption(index)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  selected
                    ? 'border-teal-500 bg-teal-500/10 shadow-sm shadow-teal-500/10'
                    : 'border-slate-700/50 bg-slate-800/20 hover:border-slate-600 hover:bg-slate-800/40'
                }`}
              >
                {/* Radio / Checkbox indicator */}
                <div
                  className={`w-5 h-5 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                    isRadio ? 'rounded-full' : 'rounded-md'
                  } ${
                    selected
                      ? 'bg-teal-500 border-2 border-teal-500'
                      : 'border-2 border-slate-600 group-hover:border-slate-500'
                  }`}
                >
                  {selected && isRadio && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                  {selected && !isRadio && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium transition-colors ${
                    selected ? 'text-white' : 'text-slate-300 group-hover:text-white'
                  }`}>
                    {opt}
                  </span>
                </div>

                <span className={`text-xs font-code transition-colors ${
                  selected ? 'text-teal-400' : 'text-slate-600'
                }`}>
                  [{index}]
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Numeric input */}
      {isNumeric && details.numericConstraints && (
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 space-y-5">
          <div className="text-center">
            <div className="text-4xl font-bold font-code text-white mb-1">
              {numericValue.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500">
              {details.numericConstraints.step && `Step: ${details.numericConstraints.step}`}
            </p>
          </div>

          <div>
            <input
              type="range"
              min={details.numericConstraints.minValue}
              max={details.numericConstraints.maxValue}
              step={details.numericConstraints.step ?? 1}
              value={numericValue}
              onChange={(e) => setNumericValue(parseInt(e.target.value))}
              className="w-full accent-teal-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2 font-code">
              <span>{details.numericConstraints.minValue}</span>
              <span>{details.numericConstraints.maxValue}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-center">
            <label className="text-xs text-slate-500">Direct input:</label>
            <input
              type="number"
              min={details.numericConstraints.minValue}
              max={details.numericConstraints.maxValue}
              step={details.numericConstraints.step ?? 1}
              value={numericValue}
              onChange={(e) => setNumericValue(parseInt(e.target.value) || 0)}
              className="w-28 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center font-code focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 outline-none"
            />
          </div>
        </div>
      )}

      {/* Response payload preview (collapsible) */}
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPayload(!showPayload)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-400 transition-colors"
        >
          <span>Response Metadata Payload</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showPayload ? 'rotate-180' : ''}`} />
        </button>
        {showPayload && (
          <div className="px-4 pb-3 animate-slideDown">
            <pre className="text-xs font-code text-slate-400 overflow-x-auto bg-slate-900/30 rounded-lg p-3">
              {JSON.stringify(
                {
                  17: {
                    msg: [`Response to ${survey.details.title}`],
                    surveyResponse: response,
                  },
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>

      {/* Validation errors */}
      {!validation.valid && selectedIndices.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{validation.errors[0]}</span>
        </div>
      )}

      {/* Wallet / CLI mode selection for testnet */}
      {isOnChainMode && (!wallet.connectedWallet || forceCliOnlySurvey) && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-300">
                  {forceCliOnlySurvey ? 'CLI-only survey (CC/SPO required)' : t('vote.walletNotConnected')}
                </p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  {forceCliOnlySurvey ? 'Connected wallets are ignored for submission here.' : t('vote.connectOrCli')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCliMode((v) => !v)}
              disabled={forceCliOnlySurvey}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                cliMode
                  ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                  : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:text-white'
              }`}
              >
                <Terminal className="w-3.5 h-3.5" />
              {forceCliOnlySurvey ? 'CLI required' : (cliMode ? t('vote.cliEnabled') : t('vote.useCli'))}
            </button>
          </div>

          {cliMode && (
            <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl space-y-3 cli-mode-panel">
              <label className="text-xs text-slate-400 block">
                {t('vote.credentialInputLabel')}
              </label>
              <div className="flex gap-2 cli-credential-row">
                <input
                  value={cliCredential}
                  onChange={(e) => {
                    setCliCredential(e.target.value);
                    resetCliProofStatus();
                  }}
                  placeholder={t('vote.credentialPlaceholder')}
                  className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-teal-500/40 cli-credential-input"
                />
                <button
                  type="button"
                  onClick={checkCliEligibility}
                  disabled={cliChecking}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-700/60 text-slate-200 hover:bg-slate-700 disabled:opacity-60 cli-check-btn"
                >
                  {cliChecking ? t('common.checking') : t('common.check')}
                </button>
              </div>
              {cliError && <p className="text-xs text-amber-300">{cliError}</p>}
              {!cliChecking && cliWalletRoles.length > 0 && (
                <p className="text-xs text-emerald-300">
                  {t('vote.eligibleRoles')}: {cliWalletRoles.map((r) => roleLabel(r)).join(', ')}
                </p>
              )}
              {cliProofRole && (
                <div className="pt-2 border-t border-slate-700/40 space-y-2">
                  <p className="text-xs text-slate-400">
                    {cliProofRole === 'DRep' ? t('vote.drepCliProofRequired') : 'Proof required for this credential type.'}
                  </p>
                  <div className="bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 cli-proof-box">
                    <p className="text-[11px] text-slate-400 mb-1">{t('vote.challengeToSign')}</p>
                    <pre className="text-[11px] font-code text-slate-300 overflow-x-auto whitespace-pre-wrap break-all cli-proof-pre">
{proofChallenge}
                    </pre>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(proofChallenge);
                        toast.success(t('vote.drepChallengeCopied'));
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium text-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t('vote.copyChallenge')}
                    </button>
                  </div>
                  <div className="bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 cli-proof-box">
                    <p className="text-[11px] text-slate-400 mb-1">{t('vote.cliProofValidatorCommand')}</p>
                    <pre className="text-[11px] font-code text-slate-300 overflow-x-auto whitespace-pre-wrap break-all cli-proof-pre">
{cliProofRole === 'DRep' ? cliProofValidationCommand : 'Local signature validation is enough here; on-chain role verification is done during tally indexing.'}
                    </pre>
                    {cliProofRole === 'DRep' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(cliProofValidationCommand);
                          toast.success(t('vote.proofValidatorCommandCopied'));
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium text-xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t('vote.copyValidatorCommand')}
                      </button>
                    )}
                  </div>
                  <label className="text-xs text-slate-500 block">proof.key (COSE key CBOR hex)</label>
                  <textarea
                    value={cliProofKey}
                    onChange={(e) => {
                      setCliProofKey(e.target.value);
                      resetCliProofStatus();
                    }}
                    rows={3}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-xs font-code text-white outline-none focus:ring-2 focus:ring-teal-500/40"
                  />
                  <label className="text-xs text-slate-500 block">proof.signature (COSE Sign1 CBOR hex)</label>
                  <textarea
                    value={cliProofSignature}
                    onChange={(e) => {
                      setCliProofSignature(e.target.value);
                      resetCliProofStatus();
                    }}
                    rows={3}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-xs font-code text-white outline-none focus:ring-2 focus:ring-teal-500/40"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={validateCliProof}
                      disabled={cliProofChecking}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/60 text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                    >
                      {cliProofChecking ? t('common.validating') : 'Validate proof'}
                    </button>
                    {cliProofMessage && (
                      <p className={`text-xs ${cliProofValidated ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {cliProofMessage}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Eligibility status */}
      {hasEligibilityRestrictions && isOnChainMode && hasWalletVotingPath && (
        <div className="animate-fadeIn">
          {/* Checking state */}
          {eligibility.checking && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/40 border border-slate-700/30 rounded-xl">
              <Loader2 className="w-5 h-5 text-teal-400 flex-shrink-0 animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-300">{t('vote.checkingEligibility')}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('vote.verifyingOnChainRoles')}
                </p>
              </div>
            </div>
          )}

          {/* Eligible */}
          {!eligibility.checking && eligibility.eligible && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-300">{t('vote.eligibleToVote')}</p>
                <p className="text-xs text-emerald-400/70 mt-0.5">
                  {t('vote.walletHoldsRequiredRoles')}{' '}
                  {eligibility.walletRoles.map((r) => roleLabel(r)).join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Not eligible */}
          {!eligibility.checking && !eligibility.eligible && !eligibility.error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <ShieldX className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-300">{t('vote.notEligibleToVote')}</p>
                <p className="text-xs text-red-400/70 mt-1">
                  {t('vote.requiresOneOf')}{' '}
                  {details.eligibility!.map((r) => roleLabel(r)).join(', ')}
                </p>
                {eligibility.missingRoles.length > 0 && (
                  <p className="text-xs text-red-400/50 mt-0.5">
                    {t('vote.missing')}: {eligibility.missingRoles.map((r) => roleLabel(r)).join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={eligibility.recheck}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                title={t('vote.recheckEligibility')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Error state */}
          {!eligibility.checking && eligibility.error && (
            <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-300">{t('vote.eligibilityCheckFailed')}</p>
                <p className="text-xs text-amber-400/70 mt-0.5">{eligibility.error}</p>
              </div>
              <button
                type="button"
                onClick={eligibility.recheck}
                className="p-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                title={t('vote.retryEligibilityCheck')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Required roles badge row */}
          <div className="flex flex-wrap gap-2 mt-3">
            {details.eligibility!.map((role) => {
              const held = eligibility.walletRoles.includes(role);
              return (
                <span
                  key={role}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                    held
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-slate-500 bg-slate-800/30 border-slate-700/30'
                  }`}
                >
                  {held ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <ShieldX className="w-3 h-3" />
                  )}
                  {roleLabel(role)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* CLI eligibility status */}
      {hasEligibilityRestrictions && isOnChainMode && (!wallet.connectedWallet || forceCliOnlySurvey) && cliMode && (
        <div className="animate-fadeIn">
          {cliChecking && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/40 border border-slate-700/30 rounded-xl">
              <Loader2 className="w-5 h-5 text-teal-400 flex-shrink-0 animate-spin" />
              <p className="text-sm text-slate-300">{t('vote.checkingCliEligibility')}</p>
            </div>
          )}
          {!cliChecking && cliEligible && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-300">{t('vote.eligibleWithCliCredential')}</p>
            </div>
          )}
          {!cliChecking && !cliEligible && cliCredential.trim() && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <ShieldX className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-300">{t('vote.notEligibleToVote')}</p>
                {cliMissingRoles.length > 0 && (
                  <p className="text-xs text-red-400/70 mt-0.5">
                    {t('vote.missing')}: {cliMissingRoles.map((r) => roleLabel(r)).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voting power display */}
      {isOnChainMode && hasWalletVotingPath && !eligibility.checking && eligibility.votingPowerLovelace !== null && (
        <div className="flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl animate-fadeIn">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-300">{t('vote.yourVotingPower')}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {details.voteWeighting === 'StakeBased'
                ? t('vote.stakeBasedWeightingInfo')
                : t('vote.credentialBasedWeightingInfo')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold text-white font-code">
              {formatAda(eligibility.votingPowerLovelace)}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ADA</p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="space-y-2">
        {(() => {
          const walletBlocked = isOnChainMode && !hasWalletVotingPath && !cliMode;
          const cliPath = isOnChainMode && cliMode && (!wallet.connectedWallet || forceCliOnlySurvey);
          const ccSpoWalletBlocked = Boolean(isOnChainMode && wallet.connectedWallet && ccSpoOnlySurvey);
          const eligibilityBlocked = isOnChainMode && hasEligibilityRestrictions &&
            (hasWalletVotingPath ? !eligibility.eligible : cliPath ? !cliEligible : true);
          const eligibilityChecking = isOnChainMode && hasEligibilityRestrictions &&
            (hasWalletVotingPath ? eligibility.checking : cliPath ? cliChecking : false);
          const missingCliCredential = cliPath && cliCredential.trim().length === 0;
          const invalidStakeholderCliCredential =
            cliPath &&
            (stakeholderOnlySurvey || openSurvey) &&
            cliCredential.trim().length > 0 &&
            !cliCredential.trim().startsWith('addr');
          const drepProofRequired = cliPath && Boolean(cliProofRole);
          const drepProofBlocked = drepProofRequired && !cliProofValidated;
          const isDisabled = !validation.valid || submitting || walletBlocked || eligibilityBlocked || eligibilityChecking;
          const isWalletSubmitDisabled = isDisabled || ccSpoWalletBlocked;
          const cliDisabled =
            !validation.valid ||
            submitting ||
            missingCliCredential ||
            invalidStakeholderCliCredential ||
            eligibilityBlocked ||
            eligibilityChecking ||
            drepProofBlocked;
          return (
            <button
              type="submit"
              disabled={cliPath ? cliDisabled : isWalletSubmitDisabled}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                !(cliPath ? cliDisabled : isWalletSubmitDisabled)
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-lg shadow-teal-600/20 hover:shadow-teal-500/25 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              {eligibilityChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting
                ? t('common.submitting')
                : eligibilityChecking
                  ? t('vote.checkingEligibility')
                  : eligibilityBlocked
                    ? t('vote.notEligibleToVote')
                    : ccSpoWalletBlocked
                      ? 'CLI only for CC/SPO'
                    : drepProofBlocked
                      ? t('vote.validateDrepProofFirst')
                    : cliPath
                      ? t('vote.copyVoteMetadata')
                      : t('vote.submitVote')}
            </button>
          );
        })()}

        {!validation.valid && selectedIndices.length === 0 && isOptionBased && (
          <p className="text-xs text-slate-500 text-center">
            {t('vote.selectAboveToCast', { target: method === METHOD_SINGLE_CHOICE ? t('vote.anOption') : t('vote.oneOrMoreOptions') })}
          </p>
        )}
        {isOnChainMode && forceCliOnlySurvey && (
          <p className="text-xs text-amber-300 text-center">
            CC/SPO surveys are CLI-only. Connected wallets are ignored for submission.
          </p>
        )}
        {isOnChainMode && cliMode && (!wallet.connectedWallet || forceCliOnlySurvey) && (
          <div className="text-xs text-slate-500 bg-slate-800/20 border border-slate-700/30 rounded-lg p-3">
            <div className="mb-3 rounded-lg border border-slate-700/40 bg-slate-900/30 p-3 cli-quick-guide">
              <p className="text-slate-300 font-semibold mb-2">{t('vote.quickCliGuide')}</p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400">
                <li>{t('vote.quickCliStep1')}</li>
                <li>{t('vote.quickCliStep2')}</li>
                <li>{t('vote.quickCliStep3')}</li>
                <li>{t('vote.quickCliStep4')}</li>
                <li>{t('vote.quickCliStep5')}</li>
              </ol>
            </div>
            <p className="mb-2 cli-help-line">{t('vote.useMetadataWithLabel')} <code>17</code>.</p>
            <div className="flex flex-wrap gap-3 mb-3 cli-actions-row">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(copyVoteMetadataText);
                  toast.success(t('vote.cliMetadataPayloadCopied'));
                }}
                className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('create.copyMetadataJson')}
              </button>
              <button
                type="button"
                onClick={downloadCliMetadata}
                className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {t('create.downloadMetadataJson')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(cliHelperScript);
                  toast.success(t('vote.cliHelperScriptCopied'));
                }}
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('create.copyHelperScript')}
              </button>
              <button
                type="button"
                onClick={downloadCliHelperScript}
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {t('create.downloadHelperScript')}
              </button>
            </div>
            <p className="mb-2 text-slate-400 cli-help-line">{t('vote.cliTemplate')}</p>
            <pre className="text-[11px] leading-relaxed font-code text-slate-300 overflow-x-auto bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 cli-commands-pre">
{cliCommandTemplate}
            </pre>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(cliCommandTemplate);
                toast.success(t('vote.cardanoCliTemplateCopied'));
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium cli-action-btn"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('create.copyCliCommands')}
            </button>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvancedCli((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 font-medium"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedCli ? 'rotate-180' : ''}`} />
                Optional: multi-party witness flow (advanced)
              </button>
              {showAdvancedCli && (
                <>
                  <p className="text-slate-400">Only needed when signatures are collected from multiple parties.</p>
                  <pre className="text-[11px] leading-relaxed font-code text-slate-300 overflow-x-auto bg-slate-900/40 border border-slate-700/30 rounded-lg p-3">
{`# 1) Build tx body
${cliBuildOnlyTemplate}

# 2) Witness (each signer)
${cliWitnessTemplate}

# 3) Assemble
${cliAssembleTemplate}

# 4) Submit
${cliSubmitTemplate}`}
                  </pre>
                  <button
                    type="button"
                    onClick={async () => {
                      const txt = `# 1) Build tx body\n${cliBuildOnlyTemplate}\n\n# 2) Witness (each signer)\n${cliWitnessTemplate}\n\n# 3) Assemble\n${cliAssembleTemplate}\n\n# 4) Submit\n${cliSubmitTemplate}`;
                      await navigator.clipboard.writeText(txt);
                      toast.success('Advanced CLI workflow copied');
                    }}
                    className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy advanced workflow
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-[11px] text-slate-500 cli-help-line cli-identity-note">
              {t('vote.identityModelInfo')}
            </p>
          </div>
        )}
        {verifyVoteCommand && (
          <div className="text-xs text-slate-500 bg-slate-800/20 border border-slate-700/30 rounded-lg p-3">
            <p className="mb-2 text-slate-400">{t('vote.verifySubmittedVote')}</p>
            <pre className="text-[11px] leading-relaxed font-code text-slate-300 overflow-x-auto bg-slate-900/40 border border-slate-700/30 rounded-lg p-3">
{verifyVoteCommand}
            </pre>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(verifyVoteCommand);
                toast.success(t('vote.verifyCommandCopied'));
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('vote.copyVerifyCommand')}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
