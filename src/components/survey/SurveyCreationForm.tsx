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
import { SPEC_VERSION } from '../../constants/methodTypes.ts';
import { buildCopyContent, getUserPreferences } from '../../utils/userPreferences.ts';
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
  const { blockchain, dispatch, mode, wallet } = useApp();
  const { t } = useI18n();
  const [cliMode, setCliMode] = useState(false);
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';

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
  const [prefs, setPrefs] = useState(() => getUserPreferences());

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
  const createMsg = title ? [title] : undefined;

  const cliCreatePayload = useMemo(() => ({
    17: {
      ...(createMsg ? { msg: createMsg } : {}),
      surveyDetails,
    },
  }), [createMsg, surveyDetails]);

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
      toast.error(t('create.fixValidationErrors'));
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

          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              {t('create.question')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('create.questionPlaceholder')}
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
              details={surveyDetails}
              msg={createMsg}
              isValid={Boolean(isFormFilled) && validation.valid}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
