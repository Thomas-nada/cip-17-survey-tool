import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PenTool } from 'lucide-react';
import { SurveyCreationForm } from '../components/survey/SurveyCreationForm.tsx';

export function CreateSurveyPage() {
  const navigate = useNavigate();

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
          <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <PenTool className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Create Survey</h2>
            <p className="text-sm text-slate-500">
              Build a CIP-17 survey definition with live metadata preview
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <SurveyCreationForm
        onCreated={(txId) => navigate(`/survey/${txId}`)}
      />
    </div>
  );
}
