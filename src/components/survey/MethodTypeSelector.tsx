import { BUILTIN_METHODS } from '../../constants/methodTypes.ts';
import type { MethodType } from '../../types/survey.ts';
import { ListChecks, CheckSquare, Sliders } from 'lucide-react';

const ICONS = {
  'urn:cardano:poll-method:single-choice:v1': ListChecks,
  'urn:cardano:poll-method:multi-select:v1': CheckSquare,
  'urn:cardano:poll-method:numeric-range:v1': Sliders,
} as const;

interface Props {
  value: MethodType;
  onChange: (method: MethodType) => void;
}

export function MethodTypeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">
        Voting Method <span className="text-red-400">*</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {BUILTIN_METHODS.map((method) => {
          const Icon = ICONS[method.value as keyof typeof ICONS];
          const selected = value === method.value;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => onChange(method.value)}
              className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                selected
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {Icon && (
                  <Icon
                    className={`w-5 h-5 ${
                      selected ? 'text-teal-400' : 'text-slate-500'
                    }`}
                  />
                )}
                <span
                  className={`font-semibold text-sm ${
                    selected ? 'text-teal-300' : 'text-slate-300'
                  }`}
                >
                  {method.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">{method.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
