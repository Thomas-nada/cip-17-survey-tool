import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SurveyCreationForm } from '../components/survey/SurveyCreationForm.tsx';

export function CreateSurveyPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">Create Survey</h2>
          <p className="text-sm text-slate-400">
            Build a CIP-17 survey definition with live metadata preview
          </p>
        </div>
      </div>

      {/* Form */}
      <SurveyCreationForm
        onCreated={(txId) => navigate(`/survey/${txId}`)}
      />
    </div>
  );
}
