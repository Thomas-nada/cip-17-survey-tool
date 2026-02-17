import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, FileJson, MessageSquare, BarChart3, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { SurveyResponseForm } from '../components/response/SurveyResponseForm.tsx';
import { TallyDashboard } from '../components/results/TallyDashboard.tsx';

type Tab = 'respond' | 'results' | 'metadata';

export function SurveyDetailPage() {
  const { surveyTxId } = useParams<{ surveyTxId: string }>();
  const navigate = useNavigate();
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('respond');
  const [copied, setCopied] = useState(false);

  const survey = state.surveys.find((s) => s.surveyTxId === surveyTxId);

  if (!survey) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 mb-4">Survey not found</p>
        <button
          onClick={() => navigate('/surveys')}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Back to surveys
        </button>
      </div>
    );
  }

  const responseCount =
    state.responses.get(survey.surveyTxId)?.length ?? 0;

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'respond', label: 'Respond', icon: MessageSquare },
    { id: 'results', label: `Results (${responseCount})`, icon: BarChart3 },
    { id: 'metadata', label: 'Metadata', icon: FileJson },
  ];

  const copyHash = async () => {
    await navigator.clipboard.writeText(survey.surveyHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/surveys')}
          className="p-2 text-slate-400 hover:text-white transition-colors mt-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-white mb-1">
            {survey.details.title}
          </h2>
          <p className="text-sm text-slate-400 mb-3">
            {survey.details.description}
          </p>

          {/* Survey IDs */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-md">
              <span className="text-slate-500">TxId:</span>
              <code className="text-slate-300 font-mono">
                {survey.surveyTxId.slice(0, 24)}...
              </code>
            </div>
            <button
              onClick={copyHash}
              className="flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-md text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <span className="text-emerald-600">Hash:</span>
              <code className="font-mono">
                {survey.surveyHash.slice(0, 24)}...
              </code>
              {copied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'respond' && (
        <SurveyResponseForm
          survey={survey}
          onSubmitted={() => setActiveTab('results')}
        />
      )}

      {activeTab === 'results' && <TallyDashboard survey={survey} />}

      {activeTab === 'metadata' && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h4 className="text-sm font-medium text-slate-300">
              Full Label 17 Metadata Payload
            </h4>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[600px] overflow-y-auto">
            {JSON.stringify(survey.metadataPayload, null, 2)}
          </pre>
          <div className="px-4 py-3 border-t border-slate-700/50 bg-emerald-500/5">
            <p className="text-xs text-emerald-400">
              <span className="font-medium">surveyHash:</span>{' '}
              <code className="font-mono">{survey.surveyHash}</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
