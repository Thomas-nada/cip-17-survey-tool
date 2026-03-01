import { useState, useCallback, useMemo, useEffect } from 'react';
import { Send, AlertCircle, Wallet, Copy, Download, Terminal } from 'lucide-react';
import toast from 'react-hot-toast';
import { MethodTypeSelector } from './MethodTypeSelector.tsx';
import { OptionsEditor } from './OptionsEditor.tsx';
import { NumericConstraintsEditor } from './NumericConstraintsEditor.tsx';
import { OptionalFieldsEditor } from './OptionalFieldsEditor.tsx';
import { MetadataPreview } from './MetadataPreview.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { useI18n } from '../../context/I18nContext.tsx';
import { validateSurveyDetails } from '../../utils/validation.ts';
import {
  DEFAULT_CUSTOM_METHOD_URN,
  DEFAULT_FREETEXT_SCHEMA_HASH,
  DEFAULT_FREETEXT_SCHEMA_URI,
  SPEC_VERSION,
} from '../../constants/methodTypes.ts';
import { buildCopyContent, getUserPreferences } from '../../utils/userPreferences.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type {
  MethodType,
  SurveyDetails,
  SurveyQuestion,
  EligibilityRole,
  VoteWeighting,
  ReferenceAction,
  Lifecycle,
  NumericConstraints,
} from '../../types/survey.ts';

interface Props {
  onCreated?: (surveyTxId?: string) => void;
}

interface QuestionDraft {
  question: string;
  methodType: MethodType;
  customMethodType: string;
  methodSchemaUri: string;
  methodSchemaHash: string;
  options: string[];
  maxSelections: number;
  numericConstraints: NumericConstraints;
}

export function SurveyCreationForm({ onCreated }: Props) {
  const { blockchain, blockfrostClient, dispatch, mode, wallet } = useApp();
  const { t } = useI18n();
  const [cliMode, setCliMode] = useState(false);
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      question: '',
      methodType: METHOD_SINGLE_CHOICE,
      customMethodType: DEFAULT_CUSTOM_METHOD_URN,
      methodSchemaUri: DEFAULT_FREETEXT_SCHEMA_URI,
      methodSchemaHash: DEFAULT_FREETEXT_SCHEMA_HASH,
      options: ['', ''],
      maxSelections: 1,
      numericConstraints: { minValue: 0, maxValue: 100 },
    },
  ]);
  const [eligibility, setEligibility] = useState<EligibilityRole[] | undefined>(['Stakeholder']);
  const [voteWeighting, setVoteWeighting] = useState<VoteWeighting | undefined>('StakeBased');
  const [referenceAction, setReferenceAction] = useState<ReferenceAction | undefined>();
  const [lifecycle, setLifecycle] = useState<Lifecycle | undefined>();
  const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
  const [lifecycleTouched, setLifecycleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefs, setPrefs] = useState(() => getUserPreferences());

  useEffect(() => {
    let cancelled = false;
    if (!isOnChainMode || !blockfrostClient) return;
    (async () => {
      try {
        const latestEpoch = await blockfrostClient.getLatestEpoch();
        if (cancelled) return;
        const epoch = typeof latestEpoch.epoch === 'number' ? latestEpoch.epoch : null;
        setCurrentEpoch(epoch);
        if (epoch !== null && !lifecycleTouched && !lifecycle) {
          setLifecycle({ endEpoch: epoch + 6 });
        }
      } catch {
        if (!cancelled) {
          setCurrentEpoch(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOnChainMode, blockfrostClient, lifecycleTouched, lifecycle]);
  const buildQuestionFromDraft = useCallback((draft: QuestionDraft, index: number): SurveyQuestion => {
    const isCustom = ![
      METHOD_SINGLE_CHOICE,
      METHOD_MULTI_SELECT,
      METHOD_NUMERIC_RANGE,
    ].includes(draft.methodType as typeof METHOD_SINGLE_CHOICE);

    const base: SurveyQuestion = {
      questionId: `q${index + 1}`,
      question: draft.question.trim(),
      methodType: isCustom ? draft.customMethodType.trim() : draft.methodType,
    };

    if (draft.methodType === METHOD_SINGLE_CHOICE) {
      base.options = draft.options.filter((o) => o.trim() !== '');
    } else if (draft.methodType === METHOD_MULTI_SELECT) {
      base.options = draft.options.filter((o) => o.trim() !== '');
      base.maxSelections = draft.maxSelections;
    } else if (draft.methodType === METHOD_NUMERIC_RANGE) {
      base.numericConstraints = draft.numericConstraints;
    } else {
      base.methodSchemaUri = draft.methodSchemaUri.trim();
      base.hashAlgorithm = 'blake2b-256';
      base.methodSchemaHash = draft.methodSchemaHash.trim();
    }

    return base;
  }, []);

  const nonEmptyQuestions = useMemo(
    () => questions.filter((q) => q.question.trim().length > 0),
    [questions]
  );

  const previewSurveyDetails = useMemo((): SurveyDetails => {
    const details: SurveyDetails = {
      specVersion: SPEC_VERSION,
      title,
      description,
      questions: nonEmptyQuestions.map((q, i) => buildQuestionFromDraft(q, i)),
    };
    if (eligibility && eligibility.length > 0) details.eligibility = eligibility;
    if (voteWeighting) details.voteWeighting = voteWeighting;
    if (referenceAction) details.referenceAction = referenceAction;
    if (lifecycle) details.lifecycle = lifecycle;
    return details;
  }, [title, description, nonEmptyQuestions, buildQuestionFromDraft, eligibility, voteWeighting, referenceAction, lifecycle]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('title is required');
    if (!description.trim()) errors.push('description is required');
    if (nonEmptyQuestions.length === 0) errors.push('at least one question is required');

    questions.forEach((draft, index) => {
      const details: SurveyDetails = {
        specVersion: SPEC_VERSION,
        title: title || 'tmp',
        description: description || 'tmp',
        questions: [buildQuestionFromDraft(draft, index)],
      };
      const result = validateSurveyDetails(details);
      if (!result.valid) {
        result.errors.forEach((err) => errors.push(`Question ${index + 1}: ${err}`));
      }
    });
    return { valid: errors.length === 0, errors };
  }, [title, description, questions, nonEmptyQuestions.length, buildQuestionFromDraft]);

  const isFormFilled = title.trim() && description.trim() && nonEmptyQuestions.length > 0;
  const createMsg = title ? [title] : undefined;

  const cliCreatePayload = useMemo(() => ({
    17: {
      ...(createMsg ? { msg: createMsg } : {}),
      surveyDetails: previewSurveyDetails,
    },
  }), [createMsg, previewSurveyDetails]);

  const cliCreatePayloadJson = useMemo(
    () => JSON.stringify(cliCreatePayload, null, 2),
    [cliCreatePayload]
  );

  const cliCreateFilename = useMemo(() => {
    const safe = (title.trim() || 'survey')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return `create-survey-${safe || 'survey'}.json`;
  }, [title]);

  const cliCreateCommandTemplate = useMemo(() => {
    const netFlag = mode === 'mainnet' ? '--mainnet' : '--testnet-magic 2';
    return [
      `# 1) Save metadata JSON as ./${cliCreateFilename}`,
      `# 2) Build, sign, and submit the transaction`,
      `cardano-cli transaction build \\`,
      `  ${netFlag} \\`,
      `  --tx-in <TX_IN> \\`,
      `  --change-address <YOUR_CHANGE_ADDRESS> \\`,
      `  --metadata-json-file ./${cliCreateFilename} \\`,
      `  --out-file create-survey.txbody`,
      ``,
      `cardano-cli transaction sign \\`,
      `  --tx-body-file create-survey.txbody \\`,
      `  --signing-key-file <PAYMENT_SKEY_FILE> \\`,
      `  ${netFlag} \\`,
      `  --out-file create-survey.tx`,
      ``,
      `cardano-cli transaction submit ${netFlag} --tx-file create-survey.tx`,
    ].join('\n');
  }, [cliCreateFilename, mode]);
  const copyCreateMetadataText = useMemo(
    () => buildCopyContent(prefs.copyFormat, cliCreatePayload, cliCreateCommandTemplate),
    [prefs.copyFormat, cliCreatePayload, cliCreateCommandTemplate]
  );

  const cliCreateHelperFilename = useMemo(() => {
    const safe = (title.trim() || 'survey')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return `create-survey-helper-${safe || 'survey'}.sh`;
  }, [title]);

  const cliCreateHelperScript = useMemo(() => {
    return [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      `METADATA_FILE="${cliCreateFilename}"`,
      '',
      "cat > \"$METADATA_FILE\" <<'JSON'",
      cliCreatePayloadJson,
      'JSON',
      '',
      'echo "Wrote $METADATA_FILE"',
      'echo',
      'echo "Next commands:"',
      cliCreateCommandTemplate,
      '',
    ].join('\n');
  }, [cliCreateFilename, cliCreatePayloadJson, cliCreateCommandTemplate]);

  const downloadCliCreateMetadata = useCallback(() => {
    const blob = new Blob([cliCreatePayloadJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cliCreateFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [cliCreatePayloadJson, cliCreateFilename]);

  const downloadCliCreateHelper = useCallback(() => {
    const blob = new Blob([cliCreateHelperScript], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cliCreateHelperFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [cliCreateHelperScript, cliCreateHelperFilename]);

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

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question: '',
        methodType: METHOD_SINGLE_CHOICE,
        customMethodType: DEFAULT_CUSTOM_METHOD_URN,
        methodSchemaUri: DEFAULT_FREETEXT_SCHEMA_URI,
        methodSchemaHash: DEFAULT_FREETEXT_SCHEMA_HASH,
        options: ['', ''],
        maxSelections: 1,
        numericConstraints: { minValue: 0, maxValue: 100 },
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validation.valid) {
      toast.error(t('create.fixValidationErrors'));
      return;
    }

    setSubmitting(true);
    try {
      const msg = [title];
      const result = await blockchain.createSurvey(previewSurveyDetails, msg);

      dispatch({
        type: 'SURVEY_CREATED',
        payload: {
          surveyTxId: result.surveyTxId,
          surveyHash: result.surveyHash,
          details: { ...previewSurveyDetails },
          msg,
          createdAt: Date.now(),
          metadataPayload: result.metadataPayload,
        },
      });

      toast.success(
        t('create.surveyCreatedTx', { tx: `${result.surveyTxId.slice(0, 16)}...` }),
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
              {t('create.surveyTitle')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('create.surveyTitlePlaceholder')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              {t('create.description')} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('create.descriptionPlaceholder')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Questions */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Question(s) <span className="text-red-400">*</span>
            </label>
            <div className="space-y-4">
              {questions.map((q, index) => {
                const isCustomMethod = ![
                  METHOD_SINGLE_CHOICE,
                  METHOD_MULTI_SELECT,
                  METHOD_NUMERIC_RANGE,
                ].includes(q.methodType as typeof METHOD_SINGLE_CHOICE);
                return (
                  <div key={index} className="border border-slate-700 rounded-xl p-4 space-y-4 bg-slate-900/40">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={q.question}
                        onChange={(e) => updateQuestion(index, { question: e.target.value })}
                        placeholder={`Question ${index + 1}`}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeQuestion(index)}
                        disabled={questions.length === 1}
                        className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Remove
                      </button>
                    </div>

                    <MethodTypeSelector
                      value={q.methodType}
                      onChange={(method) =>
                        updateQuestion(index, {
                          methodType: method,
                          ...(method === METHOD_NUMERIC_RANGE
                            ? { options: ['', ''], maxSelections: 1 }
                            : {}),
                        })
                      }
                    />

                    {(q.methodType === METHOD_SINGLE_CHOICE ||
                      q.methodType === METHOD_MULTI_SELECT) && (
                      <OptionsEditor
                        options={q.options}
                        onChange={(next) => updateQuestion(index, { options: next })}
                        maxSelections={q.maxSelections}
                        onMaxSelectionsChange={(next) => updateQuestion(index, { maxSelections: next })}
                        showMaxSelections={q.methodType === METHOD_MULTI_SELECT}
                      />
                    )}

                    {q.methodType === METHOD_NUMERIC_RANGE && (
                      <NumericConstraintsEditor
                        value={q.numericConstraints}
                        onChange={(next) => updateQuestion(index, { numericConstraints: next })}
                      />
                    )}

                    {isCustomMethod && (
                      <div className="space-y-2 border border-slate-700 rounded-lg p-3 bg-slate-900/30">
                        <p className="text-xs text-slate-500">
                          Responders will get a simple free-text area for this question.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              <div>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="text-xs font-semibold text-teal-400 hover:text-teal-300"
                >
                  + Add another question
                </button>
                <p className="text-xs text-slate-500 mt-1">
                  All questions are submitted in one on-chain survey and can use different method types.
                </p>
              </div>
            </div>
          </div>

          {/* Optional Fields */}
          <OptionalFieldsEditor
            eligibility={eligibility}
            onEligibilityChange={setEligibility}
            voteWeighting={voteWeighting}
            onVoteWeightingChange={setVoteWeighting}
            referenceAction={referenceAction}
            onReferenceActionChange={setReferenceAction}
            lifecycle={lifecycle}
            onLifecycleChange={(next) => {
              setLifecycle(next);
              setLifecycleTouched(true);
            }}
            currentEpoch={currentEpoch}
          />

          {/* Validation errors */}
          {isFormFilled && !validation.valid && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">
                  {t('create.validationIssues')}
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

          {/* Wallet connection prompt + CLI create guide */}
          {isOnChainMode && !wallet.connectedWallet && (
            <div className="animate-fadeIn">
              <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-300">Wallet not connected</p>
                      <p className="text-xs text-amber-400/70 mt-0.5">
                        {t('create.walletNotConnectedHelp')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCliMode((v) => !v)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      cliMode
                        ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {cliMode ? t('create.cliEnabled') : t('create.useCli')}
                  </button>
                </div>

                {cliMode && (
                  <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="w-4 h-4 text-teal-400" />
                      <p className="text-sm font-semibold text-teal-300">{t('create.createSurveyWithCli')}</p>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400 mb-3">
                      <li>{t('create.cliStep1')}</li>
                      <li>{t('create.cliStep2')}</li>
                      <li>{t('create.cliStep3')}</li>
                      <li>{t('create.cliStep4')}</li>
                    </ol>
                    <div className="flex flex-wrap gap-3 mb-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(copyCreateMetadataText);
                          toast.success(t('create.metadataCopied'));
                        }}
                        className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium text-xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t('create.copyMetadataJson')}
                      </button>
                      <button
                        type="button"
                        onClick={downloadCliCreateMetadata}
                        className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('create.downloadMetadataJson')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(cliCreateHelperScript);
                          toast.success(t('create.helperScriptCopied'));
                        }}
                        className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium text-xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t('create.copyHelperScript')}
                      </button>
                      <button
                        type="button"
                        onClick={downloadCliCreateHelper}
                        className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('create.downloadHelperScript')}
                      </button>
                    </div>
                    <pre className="text-[11px] leading-relaxed font-code text-slate-300 overflow-x-auto bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 mb-2">
{cliCreateCommandTemplate}
                    </pre>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(cliCreateCommandTemplate);
                        toast.success(t('create.cliCommandsCopied'));
                      }}
                      className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium text-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t('create.copyCliCommands')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!validation.valid || submitting || (isOnChainMode && !wallet.connectedWallet)}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              validation.valid && !submitting && !(isOnChainMode && !wallet.connectedWallet)
                ? 'bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white shadow-lg shadow-teal-600/20'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            {submitting
              ? t('common.submitting')
              : t('dashboard.createSurvey')}
          </button>
        </div>

        {/* Right column - Live metadata */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider font-heading">
            {t('create.liveMetadata')}
          </h3>
          <div className="sticky top-24">
            <MetadataPreview
              details={previewSurveyDetails}
              msg={createMsg}
              isValid={Boolean(isFormFilled) && validation.valid}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
