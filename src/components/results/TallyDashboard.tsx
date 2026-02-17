import { useMemo } from 'react';
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
import { BarChart3, Users, Hash } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { tallySurveyResponses } from '../../utils/tallying.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey } from '../../types/survey.ts';

const BAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f43f5e', '#84cc16',
];

interface Props {
  survey: StoredSurvey;
}

export function TallyDashboard({ survey }: Props) {
  const { state } = useApp();
  const responses = state.responses.get(survey.surveyTxId) ?? [];
  const weighting = survey.details.voteWeighting ?? 'CredentialBased';

  const tally = useMemo(() => {
    if (responses.length === 0) return null;
    return tallySurveyResponses(survey.details, responses, weighting);
  }, [survey.details, responses, weighting]);

  if (!tally || responses.length === 0) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-8 text-center">
        <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">
          No responses yet. Submit a response to see results!
        </p>
      </div>
    );
  }

  const method = survey.details.methodType;
  const isOptionBased =
    method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT;
  const isNumeric = method === METHOD_NUMERIC_RANGE;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Total Responses</span>
          </div>
          <p className="text-2xl font-bold text-white">{tally.totalResponses}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400">Unique Voters</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {tally.uniqueCredentials}
          </p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">Weighting</span>
          </div>
          <p className="text-sm font-semibold text-white mt-1">
            {tally.weighting}
          </p>
        </div>
      </div>

      {/* Option-based chart */}
      {isOptionBased && tally.optionTallies && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h4 className="text-sm font-medium text-slate-300 mb-4">
            Vote Distribution
          </h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={tally.optionTallies.map((t) => ({
                name: t.label,
                votes: t.count,
              }))}
              margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                angle={-30}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                }}
              />
              <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                {tally.optionTallies.map((_, index) => (
                  <Cell
                    key={index}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Option breakdown table */}
          <div className="mt-4 space-y-2">
            {tally.optionTallies.map((t, i) => {
              const totalVotes = tally.optionTallies!.reduce(
                (sum, x) => sum + x.count,
                0
              );
              const pct = totalVotes > 0 ? (t.count / totalVotes) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                  <span className="text-sm text-slate-300 flex-1">
                    {t.label}
                  </span>
                  <span className="text-sm font-mono text-slate-400">
                    {t.count} votes
                  </span>
                  <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-12 text-right">
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
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h4 className="text-sm font-medium text-slate-300 mb-4">
            Value Distribution
          </h4>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Mean', value: tally.numericTally.mean.toFixed(2) },
              { label: 'Median', value: tally.numericTally.median.toFixed(2) },
              { label: 'Min', value: tally.numericTally.min },
              { label: 'Max', value: tally.numericTally.max },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-slate-900/50 rounded-lg p-3 text-center"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-bold font-mono text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Histogram */}
          {tally.numericTally.bins.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tally.numericTally.bins}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="range"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Response list */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h4 className="text-sm font-medium text-slate-300">
            Individual Responses
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">
                  Credential
                </th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">
                  Value
                </th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">
                  Slot
                </th>
              </tr>
            </thead>
            <tbody>
              {responses.map((resp) => (
                <tr
                  key={resp.txId}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">
                    {resp.responseCredential.slice(0, 16)}...
                  </td>
                  <td className="px-4 py-2 text-slate-300">
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
                      <span className="font-mono">{resp.numericValue}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {resp.slot}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
