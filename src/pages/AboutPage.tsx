import { useNavigate } from 'react-router-dom';
import { FileText, ShieldCheck, BarChart3, Hash, Vote, CheckCircle2, ArrowRight } from 'lucide-react';

export function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-slate-800/25 border border-slate-700/30 rounded-2xl p-6 md:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/20 mb-3">
          <FileText className="w-3.5 h-3.5" />
          About This Tool
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white font-heading">
          How The On-Chain Survey Tool Works
        </h2>
        <p className="mt-3 text-slate-300 leading-relaxed">
          This tool creates surveys and responses as transaction metadata under label <span className="font-code text-teal-300">17</span>.
          It is designed so survey rules are machine-readable, responses are verifiable, and results can be independently recomputed.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2 text-teal-300">
            <CheckCircle2 className="w-4 h-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">1. Create Survey</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            A survey is published with <span className="font-code">surveyDetails</span> including title, description, and one or more questions.
            Each question carries its own method type (single choice, multi-select, numeric range, or free-text/custom schema).
          </p>
        </div>
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2 text-violet-300">
            <Hash className="w-4 h-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">2. Canonical Hash</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The survey definition is encoded to canonical CBOR and hashed (blake2b-256). This survey hash anchors what exactly was published,
            so responders and auditors can validate integrity.
          </p>
        </div>
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2 text-amber-300">
            <Vote className="w-4 h-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">3. Submit Response</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            A vote is submitted as <span className="font-code">surveyResponse</span> pointing to both <span className="font-code">surveyTxId</span> and <span className="font-code">surveyHash</span>.
            Answers are stored per question in <span className="font-code">answers[]</span>. Free-text accepts normal text and Markdown.
          </p>
        </div>
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2 text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">4. Verify Identity</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The indexer verifies claimed credentials against transaction signer context and optional proof payloads.
            Unverifiable responses are marked and excluded from counted tallies.
          </p>
        </div>
      </div>

      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-sky-300">
          <BarChart3 className="w-4 h-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wide">Tally Rules</h3>
        </div>
        <ul className="text-sm text-slate-300 space-y-2 leading-relaxed list-disc pl-5">
          <li>Latest valid response per voter is counted (older valid responses are superseded).</li>
          <li>Weighting can be credential-based (1 per counted voter) or stake-based (ADA-weighted where configured).</li>
          <li>Tallies are computed per question, supporting mixed question types in one survey.</li>
          <li>Audit exports include per-response status and a snapshot hash to support reproducibility.</li>
        </ul>
      </div>

      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200 mb-2">Metadata Shape (High-Level)</h3>
        <pre className="text-xs font-code text-slate-300 bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 overflow-x-auto">
{`{
  "17": {
    "surveyDetails": {
      "specVersion": "...",
      "title": "...",
      "description": "...",
      "questions": [
        { "questionId": "q1", "question": "...", "methodType": "..." }
      ]
    }
  }
}`}
        </pre>
        <pre className="mt-3 text-xs font-code text-slate-300 bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 overflow-x-auto">
{`{
  "17": {
    "surveyResponse": {
      "specVersion": "...",
      "surveyTxId": "...",
      "surveyHash": "...",
      "answers": [
        { "questionId": "q1", "selection": [0] }
      ]
    }
  }
}`}
        </pre>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/create')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all"
        >
          Create Survey
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate('/surveys')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800/50 border border-slate-700/40 hover:bg-slate-800 text-slate-200 rounded-xl font-semibold text-sm transition-all"
        >
          Browse Surveys
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

