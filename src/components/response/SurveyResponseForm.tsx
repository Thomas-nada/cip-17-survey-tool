import { useState, useMemo } from 'react';
import { Send, AlertCircle, CheckCircle2, ChevronDown, Wallet, ShieldCheck, ShieldX, Loader2, RefreshCw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../../context/AppContext.tsx';
import { useEligibility } from '../../hooks/useEligibility.ts';
import { validateSurveyResponse } from '../../utils/validation.ts';
import { SPEC_VERSION } from '../../constants/methodTypes.ts';
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

// Human-readable role labels
const ROLE_LABELS: Record<EligibilityRole, string> = {
  DRep: 'Delegated Representative',
  SPO: 'Stake Pool Operator',
  CC: 'Constitutional Committee',
  Stakeholder: 'ADA Holder',
};

/** Format lovelace (bigint) to a human-readable ADA string */
function formatAda(lovelace: bigint): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SurveyResponseForm({ survey, onSubmitted }: Props) {
  const { blockchain, dispatch, mode, wallet } = useApp();
  const { details } = survey;

  // Eligibility check
  const eligibility = useEligibility(details.eligibility);
  const hasEligibilityRestrictions = details.eligibility && details.eligibility.length > 0;

  // Response state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [numericValue, setNumericValue] = useState<number>(
    details.numericConstraints?.minValue ?? 0
  );
  const [submitting, setSubmitting] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const method = details.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;

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
          toast.error(`Maximum ${details.maxSelections} selections allowed`);
          return prev;
        }
        return [...prev, index];
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validation.valid) {
      toast.error('Please fix validation errors');
      return;
    }

    setSubmitting(true);
    try {
      const msg = [`Response to ${survey.details.title}`];
      const result = await blockchain.submitResponse(response, msg);

      dispatch({
        type: 'RESPONSE_SUBMITTED',
        payload: {
          surveyTxId: survey.surveyTxId,
          response: {
            txId: result.txId,
            responseCredential: result.responseCredential,
            surveyTxId: survey.surveyTxId,
            surveyHash: survey.surveyHash,
            selection: response.selection,
            numericValue: response.numericValue,
            slot: Date.now(), // simulated
            txIndexInBlock: 0,
          },
        },
      });

      toast.success('Response submitted successfully!', {
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
              Select up to {details.maxSelections} options
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
              Choose one option
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

      {/* Wallet connection prompt for testnet mode */}
      {mode === 'testnet' && !wallet.connectedWallet && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl animate-fadeIn">
          <Wallet className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">Wallet not connected</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Connect a CIP-30 wallet to submit your vote on-chain. Click &quot;Connect Wallet&quot; in the header.
            </p>
          </div>
        </div>
      )}

      {/* Eligibility status */}
      {hasEligibilityRestrictions && mode === 'testnet' && wallet.connectedWallet && (
        <div className="animate-fadeIn">
          {/* Checking state */}
          {eligibility.checking && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/40 border border-slate-700/30 rounded-xl">
              <Loader2 className="w-5 h-5 text-teal-400 flex-shrink-0 animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-300">Checking eligibility…</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verifying your on-chain roles via Blockfrost
                </p>
              </div>
            </div>
          )}

          {/* Eligible */}
          {!eligibility.checking && eligibility.eligible && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-300">Eligible to vote</p>
                <p className="text-xs text-emerald-400/70 mt-0.5">
                  Your wallet holds the required role{eligibility.walletRoles.length > 1 ? 's' : ''}:{' '}
                  {eligibility.walletRoles.map((r) => ROLE_LABELS[r]).join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Not eligible */}
          {!eligibility.checking && !eligibility.eligible && !eligibility.error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <ShieldX className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-300">Not eligible to vote</p>
                <p className="text-xs text-red-400/70 mt-1">
                  This survey requires one of:{' '}
                  {details.eligibility!.map((r) => ROLE_LABELS[r]).join(', ')}
                </p>
                {eligibility.missingRoles.length > 0 && (
                  <p className="text-xs text-red-400/50 mt-0.5">
                    Missing: {eligibility.missingRoles.map((r) => ROLE_LABELS[r]).join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={eligibility.recheck}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Re-check eligibility"
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
                <p className="text-sm font-medium text-amber-300">Eligibility check failed</p>
                <p className="text-xs text-amber-400/70 mt-0.5">{eligibility.error}</p>
              </div>
              <button
                type="button"
                onClick={eligibility.recheck}
                className="p-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                title="Retry eligibility check"
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
                  {ROLE_LABELS[role]}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Voting power display */}
      {mode === 'testnet' && wallet.connectedWallet && !eligibility.checking && eligibility.votingPowerLovelace !== null && (
        <div className="flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl animate-fadeIn">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-300">Your Voting Power</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {details.voteWeighting === 'StakeBased'
                ? 'This survey uses stake-based weighting — your vote weight scales with your ADA'
                : 'This survey uses credential-based weighting — 1 vote per wallet'}
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
          const walletBlocked = mode === 'testnet' && !wallet.connectedWallet;
          const eligibilityBlocked = mode === 'testnet' && hasEligibilityRestrictions && !eligibility.eligible;
          const eligibilityChecking = mode === 'testnet' && hasEligibilityRestrictions && eligibility.checking;
          const isDisabled = !validation.valid || submitting || walletBlocked || eligibilityBlocked || eligibilityChecking;
          return (
            <button
              type="submit"
              disabled={isDisabled}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                !isDisabled
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-lg shadow-teal-600/20 hover:shadow-teal-500/25 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              {eligibilityChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Submitting...' : eligibilityChecking ? 'Checking eligibility...' : eligibilityBlocked ? 'Not eligible to vote' : 'Submit Vote'}
            </button>
          );
        })()}

        {!validation.valid && selectedIndices.length === 0 && isOptionBased && (
          <p className="text-xs text-slate-500 text-center">
            Select {method === METHOD_SINGLE_CHOICE ? 'an option' : 'one or more options'} above to cast your vote
          </p>
        )}
      </div>
    </form>
  );
}
