import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart3, Users, Hash, TrendingUp, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { tallySurveyResponses } from '../../utils/tallying.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey } from '../../types/survey.ts';

const BAR_COLORS = [
  '#14b8a6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f43f5e', '#84cc16',
];

const RESPONSES_PER_PAGE = 10;

interface Props {
  survey: StoredSurvey;
}

export function TallyDashboard({ survey }: Props) {
  const { state } = useApp();
  const responses = state.responses.get(survey.surveyTxId) ?? [];
  const weighting = survey.details.voteWeighting ?? 'CredentialBased';
  const [showAllResponses, setShowAllResponses] = useState(false);

  const tally = useMemo(() => {
    if (responses.length === 0) return null;
    return tallySurveyResponses(survey.details, responses, weighting);
  }, [survey.details, responses, weighting]);

  if (!tally || responses.length === 0) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-12 text-center animate-fadeIn">
        <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
          <BarChart3 className="w-10 h-10 text-slate-600" />
        </div>
        <p className="text-slate-400 font-medium mb-1">No responses yet</p>
        <p className="text-sm text-slate-500">
          Submit a response to see results and tallying in action
        </p>
      </div>
    );
  }

  const method = survey.details.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;

  const displayedResponses = showAllResponses
    ? responses
    : responses.slice(0, RESPONSES_PER_PAGE);

  // Find the leading option
  const leadingOption = isOptionBased && tally.optionTallies
    ? tally.optionTallies.reduce((max, t) => (t.count > max.count ? t : max), tally.optionTallies[0])
    : null;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400 font-medium">Total Responses</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">{tally.totalResponses.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400 font-medium">Unique Voters</span>
          </div>
          <p className="text-2xl font-bold text-white font-heading">
            {tally.uniqueCredentials.toLocaleString()}
          </p>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-slate-400 font-medium">Weighting</span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5">
            {tally.weighting}
          </p>
        </div>
        {leadingOption && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Leading</span>
            </div>
            <p className="text-sm font-bold text-white mt-0.5 truncate">
              {leadingOption.label}
            </p>
          </div>
        )}
        {isNumeric && tally.numericTally && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Median</span>
            </div>
            <p className="text-2xl font-bold font-code text-white">
              {tally.numericTally.median}
            </p>
          </div>
        )}
      </div>

      {/* Option-based chart */}
      {isOptionBased && tally.optionTallies && (
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-5 font-heading">
            Vote Distribution
          </h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={tally.optionTallies.map((t) => ({
                name: t.label,
                votes: t.count,
              }))}
              margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                angle={-30}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#0c0f1a',
                  border: '1px solid rgba(20, 184, 166, 0.2)',
                  borderRadius: '12px',
                  color: '#f1f5f9',
                  fontSize: '12px',
                  padding: '8px 12px',
                }}
              />
              <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                {tally.optionTallies.map((_, index) => (
                  <Cell
                    key={index}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Option breakdown */}
          <div className="mt-6 space-y-3">
            {tally.optionTallies.map((t, i) => {
              const totalVotes = tally.optionTallies!.reduce(
                (sum, x) => sum + x.count,
                0
              );
              const pct = totalVotes > 0 ? (t.count / totalVotes) * 100 : 0;
              const isLeading = leadingOption?.label === t.label;
              return (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                  isLeading ? 'bg-slate-800/50' : ''
                }`}>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                  <span className={`text-sm flex-1 ${isLeading ? 'text-white font-semibold' : 'text-slate-300'}`}>
                    {t.label}
                    {isLeading && <Award className="w-3 h-3 text-amber-400 inline ml-1.5" />}
                  </span>
                  <span className="text-sm font-code text-slate-400 tabular-nums">
                    {t.count.toLocaleString()}
                  </span>
                  <div className="w-28 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-14 text-right font-code tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Numeric results */}
      {isNumeric && tally.numericTally && (
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-5 font-heading">
            Value Distribution
          </h4>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Mean', value: tally.numericTally.mean.toFixed(1), color: 'text-teal-400' },
              { label: 'Median', value: tally.numericTally.median.toFixed(1), color: 'text-emerald-400' },
              { label: 'Min', value: tally.numericTally.min, color: 'text-slate-400' },
              { label: 'Max', value: tally.numericTally.max, color: 'text-slate-400' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-4 text-center"
              >
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-xl font-bold font-code ${color}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Histogram */}
          {tally.numericTally.bins.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tally.numericTally.bins}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="range"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0c0f1a',
                    border: '1px solid rgba(20, 184, 166, 0.2)',
                    borderRadius: '12px',
                    color: '#f1f5f9',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Response list */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/30 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-300 font-heading">
            Individual Responses
          </h4>
          <span className="text-xs text-slate-500 font-code">
            {responses.length.toLocaleString()} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30">
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Credential
                </th>
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Value
                </th>
                <th className="px-5 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Slot
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedResponses.map((resp) => (
                <tr
                  key={resp.txId}
                  className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                >
                  <td className="px-5 py-3 font-code text-xs text-slate-400">
                    {resp.responseCredential.slice(0, 16)}...
                  </td>
                  <td className="px-5 py-3 text-slate-300 text-xs">
                    {resp.selection !== undefined && (
                      <span>
                        {resp.selection
                          .map(
                            (i) =>
                              survey.details.options?.[i] ?? `[${i}]`
                          )
                          .join(', ')}
                      </span>
                    )}
                    {resp.numericValue !== undefined && (
                      <span className="font-code font-semibold">{resp.numericValue.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-code text-xs text-slate-500">
                    {resp.slot.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Show more / less */}
        {responses.length > RESPONSES_PER_PAGE && (
          <div className="px-5 py-3 border-t border-slate-700/30">
            <button
              onClick={() => setShowAllResponses(!showAllResponses)}
              className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors"
            >
              {showAllResponses ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show all {responses.length} responses
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
