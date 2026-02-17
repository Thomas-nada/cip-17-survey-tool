import { useNavigate } from 'react-router-dom';
import { PlusCircle, Inbox } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { SurveyCard } from '../components/shared/SurveyCard.tsx';

export function SurveyListPage() {
  const navigate = useNavigate();
  const { state } = useApp();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Surveys</h2>
          <p className="text-sm text-slate-400">
            {state.surveys.length} survey{state.surveys.length !== 1 ? 's' : ''}{' '}
            created
          </p>
        </div>
        <button
          onClick={() => navigate('/create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Survey
        </button>
      </div>

      {/* Survey list */}
      {state.surveys.length === 0 ? (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-12 text-center">
          <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-4">No surveys yet</p>
          <button
            onClick={() => navigate('/create')}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium"
          >
            Create your first survey
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {state.surveys.map((survey) => {
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
