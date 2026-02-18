import { useMemo, useState } from 'react';
import { Copy, Check, FileJson } from 'lucide-react';
import type { SurveyDetails } from '../../types/survey.ts';
import { computeSurveyHash } from '../../utils/hashing.ts';
import { getSurveyCBORBytes } from '../../utils/cbor.ts';
import { METADATA_LABEL } from '../../constants/methodTypes.ts';

interface Props {
  details: SurveyDetails;
  msg?: string[];
  isValid: boolean;
}

export function MetadataPreview({ details, msg, isValid }: Props) {
  const [copied, setCopied] = useState(false);
  const [showCbor, setShowCbor] = useState(false);

  const { payload, surveyHash, cborHex } = useMemo(() => {
    if (!isValid) {
      return { payload: null, surveyHash: null, cborHex: null };
    }
    try {
      // Build the clean details object (exclude undefined fields)
      const clean: Record<string, unknown> = {
        specVersion: details.specVersion,
        title: details.title,
        description: details.description,
        question: details.question,
        methodType: details.methodType,
      };
      if (details.options) clean.options = details.options;
      if (details.maxSelections !== undefined)
        clean.maxSelections = details.maxSelections;
      if (details.numericConstraints)
        clean.numericConstraints = details.numericConstraints;
      if (details.eligibility) clean.eligibility = details.eligibility;
      if (details.voteWeighting) clean.voteWeighting = details.voteWeighting;
      if (details.referenceAction)
        clean.referenceAction = details.referenceAction;
      if (details.lifecycle) clean.lifecycle = details.lifecycle;

      const fullPayload: Record<string, unknown> = {
        [METADATA_LABEL]: {
          ...(msg && msg.length > 0 ? { msg } : {}),
          surveyDetails: clean,
        },
      };

      const hash = computeSurveyHash(details);
      const bytes = getSurveyCBORBytes(details);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return { payload: fullPayload, surveyHash: hash, cborHex: hex };
    } catch {
      return { payload: null, surveyHash: null, cborHex: null };
    }
  }, [details, msg, isValid]);

  const copyToClipboard = async () => {
    if (payload) {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isValid || !payload) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 text-center">
        <FileJson className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          Fill in the required fields to see the metadata preview
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-medium text-slate-300">
            Label 17 Metadata Payload
          </span>
        </div>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-teal-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>

      {/* Survey Hash */}
      <div className="px-4 py-3 border-b border-slate-700/30 bg-teal-500/5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-medium text-teal-400">
            Survey Hash (blake2b-256)
          </span>
        </div>
        <code className="text-xs font-code text-teal-300 break-all">
          {surveyHash}
        </code>
      </div>

      {/* JSON Preview */}
      <div className="relative">
        <pre className="p-4 text-xs font-code text-slate-300 overflow-x-auto max-h-80 overflow-y-auto">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>

      {/* CBOR Toggle */}
      <div className="border-t border-slate-700/30">
        <button
          onClick={() => setShowCbor(!showCbor)}
          className="w-full px-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-left"
        >
          {showCbor ? 'Hide' : 'Show'} Canonical CBOR (hash preimage)
        </button>
        {showCbor && cborHex && (
          <div className="px-4 pb-3">
            <code className="text-xs font-code text-orange-300/70 break-all block max-h-32 overflow-y-auto">
              {cborHex}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
