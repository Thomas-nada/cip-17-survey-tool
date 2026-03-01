import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.tsx';

interface Props {
  options: string[];
  onChange: (options: string[]) => void;
  maxSelections?: number;
  onMaxSelectionsChange?: (val: number) => void;
  showMaxSelections?: boolean;
}

export function OptionsEditor({
  options,
  onChange,
  maxSelections,
  onMaxSelectionsChange,
  showMaxSelections = false,
}: Props) {
  const { t } = useI18n();
  const addOption = () => {
    onChange([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return; // Minimum 2 options
    const updated = options.filter((_, i) => i !== index);
    onChange(updated);
    // Adjust maxSelections if needed
    if (showMaxSelections && maxSelections && maxSelections > updated.length) {
      onMaxSelectionsChange?.(updated.length);
    }
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-300">
        {t('create.options')} <span className="text-red-400">*</span>
        <span className="text-slate-500 font-normal ml-2">
          ({t('create.min2Required')})
        </span>
      </label>

      <div className="space-y-2">
        {options.map((opt, index) => (
          <div key={index} className="flex items-center gap-2 group">
            <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0" />
            <span className="text-xs text-slate-500 w-6 text-right flex-shrink-0">
              {index}
            </span>
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(index, e.target.value)}
              placeholder={`${t('create.option')} ${index + 1}`}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => removeOption(index)}
              disabled={options.length <= 2}
              className={`p-2 rounded-lg transition-colors ${
                options.length <= 2
                  ? 'text-slate-700 cursor-not-allowed'
                  : 'text-slate-500 hover:text-red-400 hover:bg-red-400/10'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addOption}
        className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('create.addOption')}
      </button>

      {showMaxSelections && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('create.maxSelections')} <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={options.length}
            value={maxSelections ?? 1}
            onChange={(e) =>
              onMaxSelectionsChange?.(parseInt(e.target.value) || 1)
            }
            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">
            {t('create.votersSelectUpTo', { count: maxSelections ?? 1, total: options.length })}
          </p>
        </div>
      )}
    </div>
  );
}
