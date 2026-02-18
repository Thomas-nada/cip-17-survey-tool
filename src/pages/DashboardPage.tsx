import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.tsx';
import { SurveyCard } from '../components/shared/SurveyCard.tsx';
import {
  PlusCircle,
  Vote,
  BarChart3,
  Hash,
  FileJson,
  Shield,
  Layers,
  ArrowRight,
  TrendingUp,
  Users,
  Activity,
  Sparkles,
} from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { mode, state } = useApp();

  const surveyCount = state.surveys.length;
  const responseCount = Array.from(state.responses.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const uniqueVoters = new Set(
    Array.from(state.responses.values())
      .flat()
      .map((r) => r.responseCredential)
  ).size;

  // Get the top 3 most active surveys (by response count)
  const featuredSurveys = [...state.surveys]
    .map((s) => ({
      survey: s,
      count: state.responses.get(s.surveyTxId)?.length ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="space-y-12 animate-fadeIn">
      {/* Hero section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a0f1a] via-[#0d1220] to-[#0a0f1a] border border-slate-700/30 p-8 md:p-12">
        {/* Background decorations — teal + violet washes */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Label 17 Proof of Concept
            </div>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide ${
              mode === 'simulated'
                ? 'bg-teal-500/10 border border-teal-500/20 text-teal-400'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <Activity className="w-3 h-3" />
              {mode === 'simulated' ? 'Simulated Mode' : 'Preview Testnet'}
            </div>
          </div>

          <h1 className="font-heading text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            On-Chain Surveys
            <span className="brand-gradient-text"> & Polls</span>
          </h1>
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mb-8 leading-relaxed">
            A standardized transaction metadata format for creating and tallying
            on-chain surveys on Cardano, using label{' '}
            <code className="text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded-md font-code text-sm">17</code>.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/create')}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-teal-600/25 hover:shadow-teal-500/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              <PlusCircle className="w-5 h-5" />
              Create Survey
            </button>
            <button
              onClick={() => navigate('/surveys')}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-semibold transition-all duration-200 border border-slate-600/50 hover:border-slate-500"
            >
              <BarChart3 className="w-5 h-5" />
              Browse Surveys
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Surveys',
            value: surveyCount,
            icon: Vote,
            color: 'text-teal-400',
            bg: 'bg-teal-500/10',
            borderColor: 'border-teal-500/20',
          },
          {
            label: 'Responses',
            value: responseCount,
            icon: TrendingUp,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
          },
          {
            label: 'Unique Voters',
            value: uniqueVoters,
            icon: Users,
            color: 'text-violet-400',
            bg: 'bg-violet-500/10',
            borderColor: 'border-violet-500/20',
          },
          {
            label: 'Avg Responses',
            value: surveyCount > 0 ? Math.round(responseCount / surveyCount) : 0,
            icon: BarChart3,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            borderColor: 'border-amber-500/20',
          },
        ].map(({ label, value, icon: Icon, color, bg, borderColor }) => (
          <div
            key={label}
            className={`glow-card ${bg} border ${borderColor} rounded-xl p-5 transition-all duration-200 hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl md:text-3xl font-bold text-white mb-0.5 font-heading">{value.toLocaleString()}</div>
            <div className="text-xs text-slate-500 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Featured surveys */}
      {featuredSurveys.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white font-heading">Active Surveys</h2>
              <p className="text-sm text-slate-500 mt-0.5">Most popular surveys by response count</p>
            </div>
            <button
              onClick={() => navigate('/surveys')}
              className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 font-medium transition-colors"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {featuredSurveys.map(({ survey, count }) => (
              <SurveyCard
                key={survey.surveyTxId}
                survey={survey}
                responseCount={count}
                onClick={() => navigate(`/survey/${survey.surveyTxId}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Features section */}
      <div>
        <div className="mb-5">
          <h2 className="text-xl font-bold text-white font-heading">What This Demonstrates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Core specification capabilities implemented in this proof of concept</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: FileJson,
              title: 'Metadata Format',
              desc: 'Label 17 payloads with surveyDetails and surveyResponse structures following the specification',
              color: 'text-teal-400',
              bg: 'from-teal-500/5 to-teal-500/0',
              border: 'border-teal-500/10 hover:border-teal-500/30',
            },
            {
              icon: Hash,
              title: 'Survey Hashing',
              desc: 'Blake2b-256 of canonical CBOR (RFC 8949 CDE) for deterministic survey identification',
              color: 'text-emerald-400',
              bg: 'from-emerald-500/5 to-emerald-500/0',
              border: 'border-emerald-500/10 hover:border-emerald-500/30',
            },
            {
              icon: Layers,
              title: 'Three Method Types',
              desc: 'Single-choice, multi-select, and numeric-range with full constraint validation',
              color: 'text-violet-400',
              bg: 'from-violet-500/5 to-violet-500/0',
              border: 'border-violet-500/10 hover:border-violet-500/30',
            },
            {
              icon: Shield,
              title: 'Response Validation',
              desc: 'Enforces selection counts, range bounds, step constraints, and hash integrity',
              color: 'text-amber-400',
              bg: 'from-amber-500/5 to-amber-500/0',
              border: 'border-amber-500/10 hover:border-amber-500/30',
            },
            {
              icon: BarChart3,
              title: 'Tallying Engine',
              desc: 'Deduplication by credential, latest-response-wins, credential-based and stake-based weighting',
              color: 'text-pink-400',
              bg: 'from-pink-500/5 to-pink-500/0',
              border: 'border-pink-500/10 hover:border-pink-500/30',
            },
            {
              icon: Vote,
              title: 'Dual Mode',
              desc: 'Simulated in-memory blockchain with demo data or Cardano Preview Testnet via Blockfrost',
              color: 'text-cyan-400',
              bg: 'from-cyan-500/5 to-cyan-500/0',
              border: 'border-cyan-500/10 hover:border-cyan-500/30',
            },
          ].map(({ icon: Icon, title, desc, color, bg, border }) => (
            <div
              key={title}
              className={`glow-card bg-gradient-to-br ${bg} border ${border} rounded-xl p-6 transition-all duration-300 hover:-translate-y-0.5`}
            >
              <div className={`inline-flex p-2.5 rounded-lg bg-slate-800/50 mb-4`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="text-white font-semibold text-sm mb-2 font-heading">{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
