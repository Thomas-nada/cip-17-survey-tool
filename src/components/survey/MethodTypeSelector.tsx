import { BUILTIN_METHODS } from '../../constants/methodTypes.ts';
import type { MethodType } from '../../types/survey.ts';
import { ListChecks, CheckSquare, Sliders, Code2 } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.tsx';
import { DEFAULT_CUSTOM_METHOD_URN } from '../../constants/methodTypes.ts';

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
  const { t } = useI18n();
  const customSelected = !BUILTIN_METHODS.some((method) => method.value === value);
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">
        {t('create.method')} <span className="text-red-400">*</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                  {method.value === 'urn:cardano:poll-method:single-choice:v1'
                    ? t('detail.methodSingleChoice')
                    : method.value === 'urn:cardano:poll-method:multi-select:v1'
                      ? t('detail.methodMultiSelect')
                      : method.value === 'urn:cardano:poll-method:numeric-range:v1'
                        ? t('detail.methodNumericRange')
                        : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {method.value === 'urn:cardano:poll-method:single-choice:v1'
                  ? t('create.methodDescSingle')
                  : method.value === 'urn:cardano:poll-method:multi-select:v1'
                    ? t('create.methodDescMulti')
                    : method.value === 'urn:cardano:poll-method:numeric-range:v1'
                      ? t('create.methodDescNumeric')
                      : ''}
              </p>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(DEFAULT_CUSTOM_METHOD_URN)}
          className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
            customSelected
              ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Code2
              className={`w-5 h-5 ${
                customSelected ? 'text-teal-400' : 'text-slate-500'
              }`}
            />
            <span
              className={`font-semibold text-sm ${
                customSelected ? 'text-teal-300' : 'text-slate-300'
              }`}
            >
              Free-text
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Responders write their answer in a free-text box
          </p>
        </button>
      </div>
    </div>
  );
}
