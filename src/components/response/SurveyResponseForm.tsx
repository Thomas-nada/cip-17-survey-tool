import { useState, useMemo } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../../context/AppContext.tsx';
import { validateSurveyResponse } from '../../utils/validation.ts';
import { SPEC_VERSION } from '../../constants/methodTypes.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey, SurveyResponse } from '../../types/survey.ts';

interface Props {
  survey: StoredSurvey;
  onSubmitted?: () => void;
}

export function SurveyResponseForm({ survey, onSubmitted }: Props) {
  const { blockchain, dispatch } = useApp();
  const { details } = survey;

  // Response state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [numericValue, setNumericValue] = useState<number>(
    details.numericConstraints?.minValue ?? 0
  );
  const [submitting, setSubmitting] = useState(false);

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

      toast.success('Response submitted!');
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Question */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-1">
          {details.question}
        </h3>
        <p className="text-sm text-slate-400">{details.description}</p>
        {method === METHOD_MULTI_SELECT && (
          <p className="text-xs text-blue-400 mt-2">
            Select up to {details.maxSelections} options
          </p>
        )}
      </div>

      {/* Option-based input */}
      {isOptionBased && details.options && (
        <div className="space-y-2">
          {details.options.map((opt, index) => {
            const selected = selectedIndices.includes(index);
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleOption(index)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  selected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-${
                    method === METHOD_SINGLE_CHOICE ? 'full' : 'md'
                  } border-2 flex items-center justify-center flex-shrink-0 ${
                    selected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-slate-600'
                  }`}
                >
                  {selected && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span className="text-sm text-slate-200">
                  <span className="text-slate-500 font-mono mr-2">
                    [{index}]
                  </span>
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Numeric input */}
      {isNumeric && details.numericConstraints && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={details.numericConstraints.minValue}
              max={details.numericConstraints.maxValue}
              step={details.numericConstraints.step ?? 1}
              value={numericValue}
              onChange={(e) => setNumericValue(parseInt(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <input
              type="number"
              min={details.numericConstraints.minValue}
              max={details.numericConstraints.maxValue}
              step={details.numericConstraints.step ?? 1}
              value={numericValue}
              onChange={(e) => setNumericValue(parseInt(e.target.value) || 0)}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{details.numericConstraints.minValue}</span>
            <span>{details.numericConstraints.maxValue}</span>
          </div>
        </div>
      )}

      {/* Response payload preview */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
        <p className="text-xs font-medium text-slate-500 mb-1">
          Response Payload
        </p>
        <pre className="text-xs font-mono text-slate-400 overflow-x-auto">
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

      {/* Validation errors */}
      {!validation.valid && selectedIndices.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          {validation.errors[0]}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!validation.valid || submitting}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
          validation.valid && !submitting
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        <Send className="w-4 h-4" />
        {submitting ? 'Submitting...' : 'Submit Response'}
      </button>
    </form>
  );
}
