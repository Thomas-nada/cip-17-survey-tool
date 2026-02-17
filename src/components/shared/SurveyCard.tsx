import {
  ListChecks,
  CheckSquare,
  Sliders,
  Clock,
  Hash,
  Users,
  ChevronRight,
} from 'lucide-react';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey } from '../../types/survey.ts';

const METHOD_CONFIG = {
  [METHOD_SINGLE_CHOICE]: {
    icon: ListChecks,
    label: 'Single Choice',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  [METHOD_MULTI_SELECT]: {
    icon: CheckSquare,
    label: 'Multi-Select',
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
  },
  [METHOD_NUMERIC_RANGE]: {
    icon: Sliders,
    label: 'Numeric Range',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
};

interface Props {
  survey: StoredSurvey;
  responseCount?: number;
  onClick?: () => void;
}

export function SurveyCard({ survey, responseCount = 0, onClick }: Props) {
  const { details } = survey;
  const config = METHOD_CONFIG[details.methodType as keyof typeof METHOD_CONFIG] ?? {
    icon: Hash,
    label: 'Custom',
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
  };
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800/50 border border-slate-700 hover:border-slate-600 rounded-xl p-5 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Method badge */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${config.color} ${config.bg}`}>
              <Icon className="w-3 h-3" />
              {config.label}
            </div>
            {details.eligibility && (
              <div className="flex gap-1">
                {details.eligibility.map((role) => (
                  <span
                    key={role}
                    className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400"
                  >
                    {role}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Title & question */}
          <h3 className="text-white font-semibold text-base mb-1 truncate">
            {details.title}
          </h3>
          <p className="text-sm text-slate-400 line-clamp-2 mb-3">
            {details.question}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {survey.surveyTxId.slice(0, 12)}...
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {responseCount} responses
            </span>
            {details.lifecycle && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Slots {details.lifecycle.startSlot.toLocaleString()} - {details.lifecycle.endSlot.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}
