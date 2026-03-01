import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PenTool } from 'lucide-react';
import { SurveyCreationForm } from '../components/survey/SurveyCreationForm.tsx';
import { useI18n } from '../context/I18nContext.tsx';

export function CreateSurveyPage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/20">
            <PenTool className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white font-heading">{t('createSurvey.title')}</h2>
            <p className="text-sm text-slate-500">
              {t('createSurvey.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <SurveyCreationForm
        onCreated={(txId) => {
          if (txId) {
            navigate(`/survey/${txId}`);
            return;
          }
          navigate('/surveys');
        }}
      />
    </div>
  );
}
