import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.tsx';
import {
  PlusCircle,
  Vote,
  BarChart3,
  Hash,
  FileJson,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { mode, state } = useApp();

  const surveyCount = state.surveys.length;
  const responseCount = Array.from(state.responses.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="space-y-10">
      {/* Hero section */}
      <div className="text-center py-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-400 text-xs font-medium mb-4">
          <Vote className="w-3.5 h-3.5" />
          CIP-17 Proof of Concept
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          On-Chain Surveys & Polls
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
          A standardized metadata format for creating and responding to
          on-chain surveys on Cardano, using transaction metadata label{' '}
          <code className="text-blue-400 bg-blue-400/10 px-1 rounded">17</code>.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigate('/create')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-600/20"
          >
            <PlusCircle className="w-5 h-5" />
            Create Survey
          </button>
          <button
            onClick={() => navigate('/surveys')}
            className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors border border-slate-700"
          >
            <BarChart3 className="w-5 h-5" />
            View Surveys
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-white mb-1">{surveyCount}</div>
          <div className="text-sm text-slate-400">Surveys Created</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-white mb-1">{responseCount}</div>
          <div className="text-sm text-slate-400">Responses Submitted</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
          <div className={`text-3xl font-bold mb-1 ${mode === 'simulated' ? 'text-blue-400' : 'text-emerald-400'}`}>
            {mode === 'simulated' ? 'Simulated' : 'Preview Testnet'}
          </div>
          <div className="text-sm text-slate-400">Active Mode</div>
        </div>
      </div>

      {/* Feature cards */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          What This PoC Demonstrates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: FileJson,
              title: 'Metadata Format',
              desc: 'CIP-17 label 17 payloads with surveyDetails and surveyResponse structures',
              color: 'text-blue-400',
            },
            {
              icon: Hash,
              title: 'Survey Hashing',
              desc: 'Blake2b-256 of canonical CBOR for deterministic survey identification',
              color: 'text-emerald-400',
            },
            {
              icon: Layers,
              title: 'Three Method Types',
              desc: 'Single-choice, multi-select, and numeric-range with full validation',
              color: 'text-purple-400',
            },
            {
              icon: Shield,
              title: 'Response Validation',
              desc: 'Enforces all CIP rules: selection counts, range bounds, step constraints',
              color: 'text-amber-400',
            },
            {
              icon: BarChart3,
              title: 'Tallying Logic',
              desc: 'Deduplication by credential, latest-response-wins, weighted and credential-based',
              color: 'text-pink-400',
            },
            {
              icon: Vote,
              title: 'Dual Mode',
              desc: 'Simulated in-memory blockchain or Cardano Preview Testnet via Blockfrost',
              color: 'text-cyan-400',
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5"
            >
              <Icon className={`w-6 h-6 ${color} mb-3`} />
              <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick start */}
      {surveyCount === 0 && (
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2">Getting Started</h3>
          <p className="text-sm text-slate-400 mb-4">
            Create your first survey to see the full CIP-17 metadata format in
            action. The live preview shows the JSON payload and computed
            surveyHash in real time.
          </p>
          <button
            onClick={() => navigate('/create')}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Create your first survey
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
