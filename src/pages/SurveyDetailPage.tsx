import { useParams, useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  FileJson,
  Vote,
  BarChart3,
  Copy,
  Check,
  ListChecks,
  CheckSquare,
  Sliders,
  Users,
  Hash,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { SurveyResponseForm } from '../components/response/SurveyResponseForm.tsx';
import { TallyDashboard } from '../components/results/TallyDashboard.tsx';
import { useI18n } from '../context/I18nContext.tsx';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

type Tab = 'respond' | 'results' | 'metadata';

const METHOD_ICONS = {
  [METHOD_SINGLE_CHOICE]: ListChecks,
  [METHOD_MULTI_SELECT]: CheckSquare,
  [METHOD_NUMERIC_RANGE]: Sliders,
};

export function SurveyDetailPage() {
  const { surveyTxId } = useParams<{ surveyTxId: string }>();
  const navigate = useNavigate();
  const { state, blockchain, dispatch, mode, currentEpoch } = useApp();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('respond');
  const [copied, setCopied] = useState(false);
  const [watchMode, setWatchMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshMs, setLastRefreshMs] = useState<number | null>(null);

  const survey = state.surveys.find((s) => s.surveyTxId === surveyTxId);
  const isOnChainMode = mode === 'mainnet' || mode === 'testnet';
  const isHydratingSurvey = !survey && state.loading;

  const copyHash = async () => {
    if (!survey) return;
    await navigator.clipboard.writeText(survey.surveyHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refreshResponses = useCallback(async (full = false) => {
    if (!surveyTxId) return;
    setRefreshing(true);
    try {
      const current = state.responses.get(surveyTxId) ?? [];
      const sinceSlot = current.reduce((max, r) => (r.slot > max ? r.slot : max), 0);
      const latest = await blockchain.getResponses(
        surveyTxId,
        !full && sinceSlot > 0 ? sinceSlot : undefined
      );
      dispatch({
        type: !full && sinceSlot > 0 ? 'RESPONSES_MERGED' : 'RESPONSES_LOADED',
        payload: { surveyTxId, responses: latest },
      });
      setLastRefreshMs(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [blockchain, dispatch, surveyTxId, state.responses]);

  useEffect(() => {
    if (activeTab !== 'results' || !watchMode || !isOnChainMode) return;
    const interval = window.setInterval(() => {
      void refreshResponses(false);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [activeTab, watchMode, isOnChainMode, refreshResponses]);

  if (isHydratingSurvey) {
    return (
      <div className="text-center py-20 animate-fadeIn">
        <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
          <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
        </div>
        <p className="text-slate-300 font-medium mb-1">{t('common.loading')}</p>
        <p className="text-sm text-slate-500 mb-6">{t('detail.loadingSurveyFromChain')}</p>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="text-center py-20 animate-fadeIn">
        <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
          <Hash className="w-10 h-10 text-slate-600" />
        </div>
        <p className="text-slate-400 font-medium mb-1">{t('detail.notFound')}</p>
        <p className="text-sm text-slate-500 mb-6">{t('detail.notFoundDesc')}</p>
        <button
          onClick={() => navigate('/surveys')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-teal-600/20"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('detail.backToSurveys')}
        </button>
      </div>
    );
  }

  const responseCount =
    state.responses.get(survey.surveyTxId)?.length ?? 0;
  const endEpoch = survey.details.lifecycle?.endEpoch;
  const hasEpochLifecycle = typeof endEpoch === 'number';
  const isExpired = hasEpochLifecycle && typeof currentEpoch === 'number' && currentEpoch > endEpoch;

  const questions = survey.details.questions && survey.details.questions.length > 0
    ? survey.details.questions
    : (survey.details.question && survey.details.methodType
      ? [{
        questionId: 'q1',
        question: survey.details.question,
        methodType: survey.details.methodType,
      }]
      : []);
  const firstMethod = questions[0]?.methodType;
  const mixedMethods = questions.length > 1 && new Set(questions.map((q) => q.methodType)).size > 1;
  const MethodIcon = mixedMethods
    ? Hash
    : (METHOD_ICONS[firstMethod as keyof typeof METHOD_ICONS] ?? Hash);
  const methodLabel = (
    mixedMethods
      ? `Mixed (${questions.length})`
      : firstMethod === METHOD_SINGLE_CHOICE
      ? t('detail.methodSingleChoice')
      : firstMethod === METHOD_MULTI_SELECT
        ? t('detail.methodMultiSelect')
        : firstMethod === METHOD_NUMERIC_RANGE
          ? t('detail.methodNumericRange')
          : 'Free-text'
  );

  const tabs: { id: Tab; label: string; icon: typeof Vote }[] = [
    { id: 'respond', label: t('detail.vote'), icon: Vote },
    { id: 'results', label: `${t('detail.results')} (${responseCount})`, icon: BarChart3 },
    { id: 'metadata', label: t('detail.technicalData'), icon: FileJson },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/surveys')}
          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200 mt-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          {/* Method badge + eligibility */}
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20">
              <MethodIcon className="w-3 h-3" />
              {methodLabel}
            </div>
            {survey.details.eligibility && (
              <div className="flex gap-1">
                {survey.details.eligibility.map((role) => (
                  <span
                    key={role}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-400 font-medium border border-slate-600/30"
                  >
                    {role}
                  </span>
                ))}
              </div>
            )}
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users className="w-3 h-3" />
              {responseCount} {t('detail.responses')}
            </span>
            {hasEpochLifecycle && (
              <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold ${
                isExpired
                  ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}>
                {isExpired ? t('survey.statusExpired') : t('survey.statusActive')}
              </span>
            )}
          </div>

          <h2 className="text-2xl font-bold text-white mb-2 font-heading">
            {survey.details.title}
          </h2>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            {survey.details.description}
          </p>

          {/* Survey IDs */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/30 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500 font-medium">{t('detail.txId')}</span>
              <code className="text-slate-300 font-code">
                {survey.surveyTxId.slice(0, 20)}...
              </code>
            </div>
            <button
              onClick={copyHash}
              className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-lg text-teal-400 hover:text-teal-300 hover:bg-teal-500/15 transition-all duration-200"
            >
              <span className="font-medium">{t('detail.hash')}</span>
              <code className="font-code">
                {survey.surveyHash.slice(0, 20)}...
              </code>
              {copied ? (
                <Check className="w-3 h-3 text-teal-300" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/20 p-1 rounded-xl border border-slate-700/30">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === id
                ? 'bg-teal-500/15 text-teal-300 shadow-sm border border-teal-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fadeIn">
        {activeTab === 'respond' && (
          <SurveyResponseForm
            survey={survey}
            onSubmitted={() => setActiveTab('results')}
          />
        )}

        {activeTab === 'results' && (
          <div className="space-y-3">
            {isOnChainMode && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-800/25 border border-slate-700/30 rounded-xl">
                <div className="text-xs text-slate-400">
                  {lastRefreshMs
                    ? t('detail.lastRefresh', { time: new Date(lastRefreshMs).toISOString().slice(0, 16).replace('T', ' ') })
                    : t('detail.noRefreshYet')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWatchMode((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      watchMode
                        ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                        : 'bg-slate-900/40 border-slate-700/40 text-slate-300 hover:text-white'
                    }`}
                  >
                    {watchMode ? t('detail.watchOn') : t('detail.watchOff')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshResponses(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/60 text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('detail.refreshNow')}
                  </button>
                </div>
              </div>
            )}
            <TallyDashboard survey={survey} />
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/30 flex items-center gap-2">
              <FileJson className="w-4 h-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-300 font-heading">
                {t('detail.fullMetadata')}
              </h4>
            </div>
            <pre className="p-5 text-xs font-code text-slate-300 overflow-x-auto max-h-[600px] overflow-y-auto leading-relaxed">
              {JSON.stringify(survey.metadataPayload, null, 2)}
            </pre>
            <div className="px-5 py-3 border-t border-slate-700/30 bg-teal-500/5">
              <p className="text-xs text-teal-400 flex items-center gap-2">
                <Hash className="w-3 h-3" />
                <span className="font-semibold">{t('detail.surveyHash')}:</span>{' '}
                <code className="font-code">{survey.surveyHash}</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
