import type { NumericConstraints } from '../../types/survey.ts';

interface Props {
  value: NumericConstraints;
  onChange: (constraints: NumericConstraints) => void;
}

export function NumericConstraintsEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-300">
        Numeric Constraints <span className="text-red-400">*</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Min Value <span className="text-red-400">*</span>
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
            Max Value <span className="text-red-400">*</span>
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
            Step <span className="text-slate-600">(optional)</span>
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
            placeholder="Any"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {value.minValue <= value.maxValue && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">
            Respondents will choose a value between{' '}
            <span className="text-teal-400 font-code">{value.minValue}</span> and{' '}
            <span className="text-teal-400 font-code">{value.maxValue}</span>
            {value.step ? (
              <>
                {' '}
                in increments of{' '}
                <span className="text-teal-400 font-code">{value.step}</span>
              </>
            ) : null}
          </p>
        </div>
      )}

      {value.minValue > value.maxValue && (
        <p className="text-xs text-red-400">
          minValue must be less than or equal to maxValue
        </p>
      )}
    </div>
  );
}
