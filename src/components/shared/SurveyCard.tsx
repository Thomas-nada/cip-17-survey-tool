import {
  ListChecks,
  CheckSquare,
  Sliders,
  Clock,
  Hash,
  Users,
  Vote,
} from 'lucide-react';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../../types/survey.ts';
import type { StoredSurvey } from '../../types/survey.ts';
import { useI18n } from '../../context/I18nContext.tsx';
import { useApp } from '../../context/AppContext.tsx';

const METHOD_CONFIG = {
  [METHOD_SINGLE_CHOICE]: {
    icon: ListChecks,
    label: 'detail.methodSingleChoice',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
  },
  [METHOD_MULTI_SELECT]: {
    icon: CheckSquare,
    label: 'detail.methodMultiSelect',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  [METHOD_NUMERIC_RANGE]: {
    icon: Sliders,
    label: 'detail.methodNumericRange',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
};

interface Props {
  survey: StoredSurvey;
  responseCount?: number;
  onClick?: () => void;
}

export function SurveyCard({ survey, responseCount = 0, onClick }: Props) {
  const { currentEpoch } = useApp();
  const { t } = useI18n();
  const { details } = survey;
  const endEpoch = details.lifecycle?.endEpoch;
  const hasEpochLifecycle = typeof endEpoch === 'number';
  const isExpired = hasEpochLifecycle && typeof currentEpoch === 'number' && currentEpoch > endEpoch;
  const questions = details.questions && details.questions.length > 0
    ? details.questions
    : (details.question && details.methodType
      ? [{
        questionId: 'q1',
        question: details.question,
        methodType: details.methodType,
      }]
      : []);
  const firstMethod = questions[0]?.methodType;
  const mixedMethods = questions.length > 1 && new Set(questions.map((q) => q.methodType)).size > 1;
  const config = METHOD_CONFIG[firstMethod as keyof typeof METHOD_CONFIG] ?? {
    icon: Hash,
    label: 'Free-text',
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  };
  const Icon = config.icon;
  const questionPreview = questions.length === 0
    ? ''
    : questions.length === 1
      ? questions[0].question
      : `${questions.length} questions`;

  return (
    <button
      onClick={onClick}
      className="glow-card w-full text-left bg-slate-800/20 rounded-xl p-5 transition-all duration-200 group hover:bg-slate-800/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Method badge + eligibility */}
          <div className="flex items-center gap-2 mb-3">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.color} ${config.bg} border ${config.border}`}>
              <Icon className="w-3 h-3" />
              {mixedMethods
                ? 'Mixed'
                : (config.label.startsWith('detail.') ? t(config.label) : config.label)}
            </div>
            {details.eligibility && (
              <div className="flex gap-1">
                {details.eligibility.map((role) => (
                  <span
                    key={role}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-400 font-medium border border-slate-600/30"
                  >
                    {t(`role.${role}`)}
                  </span>
                ))}
              </div>
            )}
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

          {/* Title & question */}
          <h3 className="text-white font-semibold text-base mb-1.5 group-hover:text-teal-100 transition-colors truncate font-heading">
            {details.title}
          </h3>
          <p className="text-sm text-slate-400 line-clamp-2 mb-4 leading-relaxed">
            {questionPreview}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-code">
              <Hash className="w-3 h-3" />
              {survey.surveyTxId.slice(0, 12)}...
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              <span className="font-semibold text-slate-400">{responseCount}</span> {t('detail.responses')}
            </span>
            {details.lifecycle?.endEpoch != null && (
              <span className="hidden sm:flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {t('surveyCard.endsEpoch', { epoch: details.lifecycle.endEpoch.toLocaleString() })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Response count indicator */}
          {responseCount > 0 && (
            <div className="hidden sm:flex flex-col items-center justify-center bg-slate-700/30 rounded-lg px-3 py-2 min-w-[60px]">
              <span className="text-lg font-bold text-white font-heading">{responseCount}</span>
              <span className="text-[10px] text-slate-500">{t('surveyCard.votes')}</span>
            </div>
          )}
          {/* Vote CTA */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-teal-600 to-teal-700 group-hover:from-teal-500 group-hover:to-teal-600 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-teal-600/20 group-hover:shadow-teal-500/30">
            <Vote className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('detail.vote')}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
