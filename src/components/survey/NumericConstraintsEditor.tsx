import type { NumericConstraints } from '../../types/survey.ts';
import { useI18n } from '../../context/I18nContext.tsx';

interface Props {
  value: NumericConstraints;
  onChange: (constraints: NumericConstraints) => void;
}

export function NumericConstraintsEditor({ value, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-300">
        {t('create.numericConstraints')} <span className="text-red-400">*</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t('create.minValue')} <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            value={value.minValue}
            onChange={(e) =>
              onChange({ ...value, minValue: parseInt(e.target.value) || 0 })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t('create.maxValue')} <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            value={value.maxValue}
            onChange={(e) =>
              onChange({ ...value, maxValue: parseInt(e.target.value) || 100 })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t('create.step')} <span className="text-slate-600">({t('create.optional')})</span>
          </label>
          <input
            type="number"
            min={1}
            value={value.step ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...value,
                step: v ? parseInt(v) || undefined : undefined,
              });
            }}
            placeholder={t('create.any')}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {value.minValue <= value.maxValue && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">
            {t('create.respondentsChooseBetween')}{' '}
            <span className="text-teal-400 font-code">{value.minValue}</span> and{' '}
            <span className="text-teal-400 font-code">{value.maxValue}</span>
            {value.step ? (
              <>
                {' '}
                {t('create.inIncrementsOf')}{' '}
                <span className="text-teal-400 font-code">{value.step}</span>
              </>
            ) : null}
          </p>
        </div>
      )}

      {value.minValue > value.maxValue && (
        <p className="text-xs text-red-400">
          {t('create.minLessThanMax')}
        </p>
      )}
    </div>
  );
}
