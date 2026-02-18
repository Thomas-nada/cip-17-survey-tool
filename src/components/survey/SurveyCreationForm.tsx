import { useState, useCallback, useMemo } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { MethodTypeSelector } from './MethodTypeSelector.tsx';
import { OptionsEditor } from './OptionsEditor.tsx';
import { NumericConstraintsEditor } from './NumericConstraintsEditor.tsx';
import { OptionalFieldsEditor } from './OptionalFieldsEditor.tsx';
import { MetadataPreview } from './MetadataPreview.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { validateSurveyDetails } from '../../utils/validation.ts';
import { SPEC_VERSION } from '../../constants/methodTypes.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type {
  MethodType,
  SurveyDetails,
  EligibilityRole,
  VoteWeighting,
  ReferenceAction,
  Lifecycle,
  NumericConstraints,
} from '../../types/survey.ts';

interface Props {
  onCreated?: (surveyTxId: string) => void;
}

export function SurveyCreationForm({ onCreated }: Props) {
  const { blockchain, dispatch } = useApp();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [question, setQuestion] = useState('');
  const [methodType, setMethodType] = useState<MethodType>(METHOD_SINGLE_CHOICE);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [maxSelections, setMaxSelections] = useState(1);
  const [numericConstraints, setNumericConstraints] = useState<NumericConstraints>({
    minValue: 0,
    maxValue: 100,
  });
  const [eligibility, setEligibility] = useState<EligibilityRole[] | undefined>();
  const [voteWeighting, setVoteWeighting] = useState<VoteWeighting | undefined>();
  const [referenceAction, setReferenceAction] = useState<ReferenceAction | undefined>();
  const [lifecycle, setLifecycle] = useState<Lifecycle | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Build current SurveyDetails from form state
  const surveyDetails = useMemo((): SurveyDetails => {
    const base: SurveyDetails = {
      specVersion: SPEC_VERSION,
      title,
      description,
      question,
      methodType,
    };

    if (methodType === METHOD_SINGLE_CHOICE) {
      base.options = options.filter((o) => o.trim() !== '');
    } else if (methodType === METHOD_MULTI_SELECT) {
      base.options = options.filter((o) => o.trim() !== '');
      base.maxSelections = maxSelections;
    } else if (methodType === METHOD_NUMERIC_RANGE) {
      base.numericConstraints = numericConstraints;
    }

    if (eligibility && eligibility.length > 0) base.eligibility = eligibility;
    if (voteWeighting) base.voteWeighting = voteWeighting;
    if (referenceAction) base.referenceAction = referenceAction;
    if (lifecycle) base.lifecycle = lifecycle;

    return base;
  }, [
    title, description, question, methodType,
    options, maxSelections, numericConstraints,
    eligibility, voteWeighting, referenceAction, lifecycle,
  ]);

  // Validation
  const validation = useMemo(
    () => validateSurveyDetails(surveyDetails),
    [surveyDetails]
  );

  const isFormFilled = title.trim() && description.trim() && question.trim();

  // Handle method type change - reset method-specific fields
  const handleMethodChange = useCallback((method: MethodType) => {
    setMethodType(method);
    if (method === METHOD_NUMERIC_RANGE) {
      setOptions(['', '']);
      setMaxSelections(1);
    }
  }, []);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validation.valid) {
      toast.error('Please fix the validation errors before submitting');
      return;
    }

    setSubmitting(true);
    try {
      const msg = [title]; // Use title as the msg field
      const result = await blockchain.createSurvey(surveyDetails, msg);

      dispatch({
        type: 'SURVEY_CREATED',
        payload: {
          surveyTxId: result.surveyTxId,
          surveyHash: result.surveyHash,
          details: { ...surveyDetails },
          msg,
          createdAt: Date.now(),
          metadataPayload: result.metadataPayload,
        },
      });

      toast.success(
        `Survey created! TxId: ${result.surveyTxId.slice(0, 16)}...`,
        { duration: 5000 }
      );

      onCreated?.(result.surveyTxId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message, { duration: 6000 });
      dispatch({ type: 'SET_ERROR', payload: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column - Form inputs */}
        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Survey Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dijkstra hard-fork CIP shortlist"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Provide context for this survey..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Question <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which CIPs should be shortlisted for Dijkstra?"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Method Type */}
          <MethodTypeSelector value={methodType} onChange={handleMethodChange} />

          {/* Method-specific fields */}
          {(methodType === METHOD_SINGLE_CHOICE ||
            methodType === METHOD_MULTI_SELECT) && (
            <OptionsEditor
              options={options}
              onChange={setOptions}
              maxSelections={maxSelections}
              onMaxSelectionsChange={setMaxSelections}
              showMaxSelections={methodType === METHOD_MULTI_SELECT}
            />
          )}

          {methodType === METHOD_NUMERIC_RANGE && (
            <NumericConstraintsEditor
              value={numericConstraints}
              onChange={setNumericConstraints}
            />
          )}

          {/* Optional Fields */}
          <OptionalFieldsEditor
            eligibility={eligibility}
            onEligibilityChange={setEligibility}
            voteWeighting={voteWeighting}
            onVoteWeightingChange={setVoteWeighting}
            referenceAction={referenceAction}
            onReferenceActionChange={setReferenceAction}
            lifecycle={lifecycle}
            onLifecycleChange={setLifecycle}
          />

          {/* Validation errors */}
          {isFormFilled && !validation.valid && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">
                  Validation Issues
                </span>
              </div>
              <ul className="space-y-1">
                {validation.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-300">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!validation.valid || submitting}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              validation.valid && !submitting
                ? 'bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white shadow-lg shadow-teal-600/20'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            {submitting
              ? 'Submitting...'
              : 'Create Survey'}
          </button>
        </div>

        {/* Right column - Live preview */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider font-heading">
            Live Preview
          </h3>
          <div className="sticky top-24">
            <MetadataPreview
              details={surveyDetails}
              msg={title ? [title] : undefined}
              isValid={Boolean(isFormFilled) && validation.valid}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
