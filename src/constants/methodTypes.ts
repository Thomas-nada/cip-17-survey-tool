import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

export const SPEC_VERSION = '1.0.0';
export const METADATA_LABEL = 17;

export const BUILTIN_METHODS = [
  {
    value: METHOD_SINGLE_CHOICE,
    label: 'Single Choice',
    description: 'Pick exactly one option from a list',
  },
  {
    value: METHOD_MULTI_SELECT,
    label: 'Multi-Select',
    description: 'Pick one or more options from a list (up to maxSelections)',
  },
  {
    value: METHOD_NUMERIC_RANGE,
    label: 'Numeric Range',
    description: 'Provide a numeric value within specified bounds',
  },
] as const;

export const ELIGIBILITY_ROLES = ['DRep', 'SPO', 'CC', 'Stakeholder'] as const;
export const VOTE_WEIGHTINGS = ['CredentialBased', 'StakeBased'] as const;
