import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ELIGIBILITY_ROLES, VOTE_WEIGHTINGS } from '../../constants/methodTypes.ts';
import type {
  EligibilityRole,
  VoteWeighting,
  ReferenceAction,
  Lifecycle,
} from '../../types/survey.ts';

interface Props {
  eligibility?: EligibilityRole[];
  onEligibilityChange: (roles: EligibilityRole[] | undefined) => void;
  voteWeighting?: VoteWeighting;
  onVoteWeightingChange: (w: VoteWeighting | undefined) => void;
  referenceAction?: ReferenceAction;
  onReferenceActionChange: (ra: ReferenceAction | undefined) => void;
  lifecycle?: Lifecycle;
  onLifecycleChange: (lc: Lifecycle | undefined) => void;
}

export function OptionalFieldsEditor({
  eligibility,
  onEligibilityChange,
  voteWeighting,
  onVoteWeightingChange,
  referenceAction,
  onReferenceActionChange,
  lifecycle,
  onLifecycleChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggleEligibility = (role: EligibilityRole) => {
    const current = eligibility ?? [];
    if (current.includes(role)) {
      const updated = current.filter((r) => r !== role);
      onEligibilityChange(updated.length > 0 ? updated : undefined);
    } else {
      onEligibilityChange([...current, role]);
    }
  };

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
      >
        <span className="text-sm font-medium text-slate-300">
          Optional Fields
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-6 bg-slate-900/50">
          {/* Eligibility */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Eligibility Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {ELIGIBILITY_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleEligibility(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    eligibility?.includes(role)
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Vote Weighting */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Vote Weighting
            </label>
            <div className="flex gap-3">
              {VOTE_WEIGHTINGS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() =>
                    onVoteWeightingChange(voteWeighting === w ? undefined : w)
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    voteWeighting === w
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Default: CredentialBased (1 vote per credential)
            </p>
          </div>

          {/* Reference Action */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">
                Governance Action Reference
              </label>
              {referenceAction ? (
                <button
                  type="button"
                  onClick={() => onReferenceActionChange(undefined)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
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
                  Add
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
                  placeholder="Transaction ID (64 hex chars)"
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
                  placeholder="Action Index"
                  className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
              </div>
            )}
          </div>

          {/* Lifecycle */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">
                End Epoch
              </label>
              {lifecycle ? (
                <button
                  type="button"
                  onClick={() => onLifecycleChange(undefined)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onLifecycleChange({ endEpoch: 0 })
                  }
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  Add
                </button>
              )}
            </div>
            {lifecycle && (
              <div className="pl-4 border-l-2 border-slate-700">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Survey closes at end of epoch
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={lifecycle.endEpoch}
                    onChange={(e) =>
                      onLifecycleChange({
                        endEpoch: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="e.g. 172"
                    className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none font-code"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Survey is live immediately after submission
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
