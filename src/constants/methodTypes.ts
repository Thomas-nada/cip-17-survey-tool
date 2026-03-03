import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

export const SPEC_VERSION = '1.0.0';
export const METADATA_LABEL = 17;
export const DEFAULT_CUSTOM_METHOD_URN = 'urn:cardano:poll-method:custom:v1';
export const DEFAULT_FREETEXT_SCHEMA_URI = 'ipfs://QmQ3amnfu4zkEv58W4eGqtBiuk1mLy9Gk3DAAaxdAq4YgB';
// blake2b-256 over the exact raw bytes in schemas/freetext-method-v1.schema.json
export const DEFAULT_FREETEXT_SCHEMA_HASH = 'e8e33f3d0f167c1201a48fc55b3a882ae173203759f8884c0c15567db6620a9d';

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
export const VOTE_WEIGHTINGS = ['CredentialBased', 'StakeBased', 'PledgeBased'] as const;
