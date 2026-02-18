import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { SurveyResponseForm } from '../components/response/SurveyResponseForm.tsx';
import { TallyDashboard } from '../components/results/TallyDashboard.tsx';
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

const METHOD_LABELS = {
  [METHOD_SINGLE_CHOICE]: 'Single Choice',
  [METHOD_MULTI_SELECT]: 'Multi-Select',
  [METHOD_NUMERIC_RANGE]: 'Numeric Range',
};

export function SurveyDetailPage() {
  const { surveyTxId } = useParams<{ surveyTxId: string }>();
  const navigate = useNavigate();
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('respond');
  const [copied, setCopied] = useState(false);

  const survey = state.surveys.find((s) => s.surveyTxId === surveyTxId);

  if (!survey) {
    return (
      <div className="text-center py-20 animate-fadeIn">
        <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
          <Hash className="w-10 h-10 text-slate-600" />
        </div>
        <p className="text-slate-400 font-medium mb-1">Survey not found</p>
        <p className="text-sm text-slate-500 mb-6">The survey you're looking for doesn't exist</p>
        <button
          onClick={() => navigate('/surveys')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-teal-600/20"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to surveys
        </button>
      </div>
    );
  }

  const responseCount =
    state.responses.get(survey.surveyTxId)?.length ?? 0;

  const MethodIcon = METHOD_ICONS[survey.details.methodType as keyof typeof METHOD_ICONS] ?? Hash;
  const methodLabel = METHOD_LABELS[survey.details.methodType as keyof typeof METHOD_LABELS] ?? 'Custom';

  const tabs: { id: Tab; label: string; icon: typeof Vote }[] = [
    { id: 'respond', label: 'Cast Vote', icon: Vote },
    { id: 'results', label: `Results (${responseCount})`, icon: BarChart3 },
    { id: 'metadata', label: 'Metadata', icon: FileJson },
  ];

  const copyHash = async () => {
    await navigator.clipboard.writeText(survey.surveyHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              {responseCount} responses
            </span>
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
              <span className="text-slate-500 font-medium">TxId</span>
              <code className="text-slate-300 font-code">
                {survey.surveyTxId.slice(0, 20)}...
              </code>
            </div>
            <button
              onClick={copyHash}
              className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-lg text-teal-400 hover:text-teal-300 hover:bg-teal-500/15 transition-all duration-200"
            >
              <span className="font-medium">Hash</span>
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

        {activeTab === 'results' && <TallyDashboard survey={survey} />}

        {activeTab === 'metadata' && (
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/30 flex items-center gap-2">
              <FileJson className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-300 font-heading">
                Full Label 17 Metadata Payload
              </h4>
            </div>
            <pre className="p-5 text-xs font-code text-slate-300 overflow-x-auto max-h-[600px] overflow-y-auto leading-relaxed">
              {JSON.stringify(survey.metadataPayload, null, 2)}
            </pre>
            <div className="px-5 py-3 border-t border-slate-700/30 bg-teal-500/5">
              <p className="text-xs text-teal-400 flex items-center gap-2">
                <Hash className="w-3 h-3" />
                <span className="font-semibold">surveyHash:</span>{' '}
                <code className="font-code">{survey.surveyHash}</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
