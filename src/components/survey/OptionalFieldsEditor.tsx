import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  ReferenceAction,
} from '../../types/survey.ts';
import { useI18n } from '../../context/I18nContext.tsx';

interface Props {
  referenceAction?: ReferenceAction;
  onReferenceActionChange: (ra: ReferenceAction | undefined) => void;
}

export function OptionalFieldsEditor({
  referenceAction,
  onReferenceActionChange,
}: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
      >
        <span className="text-sm font-medium text-slate-300">
          {t('create.optionalFields')}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-6 bg-slate-900/50">
          {/* Reference Action */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">
                {t('create.govActionReference')}
              </label>
              {referenceAction ? (
                <button
                  type="button"
                  onClick={() => onReferenceActionChange(undefined)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  {t('common.remove')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onReferenceActionChange({
                      transactionId: '',
                      actionIndex: 0,
                    })
                  }
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  {t('common.add')}
                </button>
              )}
            </div>
            {referenceAction && (
              <div className="space-y-2 pl-4 border-l-2 border-slate-700">
                <input
                  type="text"
                  value={referenceAction.transactionId}
                  onChange={(e) =>
                    onReferenceActionChange({
                      ...referenceAction,
                      transactionId: e.target.value,
                    })
                  }
                  placeholder={t('create.transactionIdPlaceholder')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none font-code"
                />
                <input
                  type="number"
                  min={0}
                  value={referenceAction.actionIndex}
                  onChange={(e) =>
                    onReferenceActionChange({
                      ...referenceAction,
                      actionIndex: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder={t('create.actionIndex')}
                  className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
