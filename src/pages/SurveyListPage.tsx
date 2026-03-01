import { useNavigate } from 'react-router-dom';
import { PlusCircle, Inbox, Vote, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { SurveyCard } from '../components/shared/SurveyCard.tsx';
import { useI18n } from '../context/I18nContext.tsx';

export function SurveyListPage() {
  const navigate = useNavigate();
  const { state } = useApp();
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return state.surveys;
    const q = search.toLowerCase();
    return state.surveys.filter(
      (s) => {
        const questionsText = (s.details.questions ?? [])
          .map((item) => item.question)
          .join(' ')
          .toLowerCase();
        const legacyQuestion = (s.details.question ?? '').toLowerCase();
        return (
          s.details.title.toLowerCase().includes(q) ||
          questionsText.includes(q) ||
          legacyQuestion.includes(q) ||
          s.surveyTxId.includes(q)
        );
      }
    );
  }, [state.surveys, search]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/20">
            <Vote className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white font-heading">{t('surveyList.title')}</h2>
            <p className="text-sm text-slate-500">
              {t('surveyList.created', { count: state.surveys.length, suffix: state.surveys.length !== 1 ? 's' : '' })}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/create')}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-teal-600/20 hover:shadow-teal-500/25 hover:-translate-y-0.5"
        >
          <PlusCircle className="w-4 h-4" />
          {t('surveyList.newSurvey')}
        </button>
      </div>

      {/* Search */}
      {state.surveys.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('surveyList.searchPlaceholder')}
            className="w-full bg-slate-800/50 border border-slate-700/30 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 outline-none transition-all"
          />
        </div>
      )}

      {/* Survey list */}
      {filtered.length === 0 ? (
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-12 text-center">
          <div className="inline-flex p-4 bg-slate-800/50 rounded-2xl mb-4">
            <Inbox className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 font-medium mb-1">
            {search ? t('surveyList.noMatching') : t('surveyList.noSurveys')}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {search
              ? t('surveyList.tryDifferent')
              : t('surveyList.createFirst')}
          </p>
          {!search && (
            <button
              onClick={() => navigate('/create')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-teal-600/20"
            >
              <PlusCircle className="w-4 h-4" />
              {t('dashboard.createSurvey')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((survey) => {
            const responseCount =
              state.responses.get(survey.surveyTxId)?.length ?? 0;
            return (
              <SurveyCard
                key={survey.surveyTxId}
                survey={survey}
                responseCount={responseCount}
                onClick={() => navigate(`/survey/${survey.surveyTxId}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
