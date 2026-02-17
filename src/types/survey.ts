// ─── Method Type URNs ───────────────────────────────────────────────
export const METHOD_SINGLE_CHOICE = 'urn:cardano:poll-method:single-choice:v1' as const;
export const METHOD_MULTI_SELECT = 'urn:cardano:poll-method:multi-select:v1' as const;
export const METHOD_NUMERIC_RANGE = 'urn:cardano:poll-method:numeric-range:v1' as const;

export type BuiltinMethodType =
  | typeof METHOD_SINGLE_CHOICE
  | typeof METHOD_MULTI_SELECT
  | typeof METHOD_NUMERIC_RANGE;

export type MethodType = BuiltinMethodType | string;

// ─── Eligibility & Weighting ────────────────────────────────────────
export type EligibilityRole = 'DRep' | 'SPO' | 'CC' | 'Stakeholder';
export type VoteWeighting = 'StakeBased' | 'CredentialBased';

// ─── Nested Objects ─────────────────────────────────────────────────
export interface NumericConstraints {
  minValue: number;
  maxValue: number;
  step?: number;
}

export interface ReferenceAction {
  transactionId: string; // 64 hex chars
  actionIndex: number;
}

export interface Lifecycle {
  startSlot: number;
  endSlot: number;
}

// ─── Survey Details (label 17 surveyDetails payload) ────────────────
export interface SurveyDetails {
  specVersion: string;
  title: string;
  description: string;
  question: string;
  methodType: MethodType;
  options?: string[];
  maxSelections?: number;
  numericConstraints?: NumericConstraints;
  methodSchemaUri?: string;
  hashAlgorithm?: string;
  methodSchemaHash?: string;
  eligibility?: EligibilityRole[];
  voteWeighting?: VoteWeighting;
  referenceAction?: ReferenceAction;
  lifecycle?: Lifecycle;
}

// ─── Survey Response (label 17 surveyResponse payload) ──────────────
export interface SurveyResponse {
  specVersion: string;
  surveyTxId: string;
  surveyHash: string;
  selection?: number[];
  numericValue?: number;
  customValue?: unknown;
}

// ─── Full Metadata Payloads ─────────────────────────────────────────
export interface SurveyDetailsPayload {
  msg?: string[];
  surveyDetails: SurveyDetails;
}

export interface SurveyResponsePayload {
  msg?: string[];
  surveyResponse: SurveyResponse;
}

export type Label17Payload = SurveyDetailsPayload | SurveyResponsePayload;

// ─── Stored / Enriched Types ────────────────────────────────────────
export interface StoredSurvey {
  surveyTxId: string;
  surveyHash: string;
  details: SurveyDetails;
  msg?: string[];
  createdAt: number; // slot or timestamp
  metadataPayload: Record<string, unknown>; // full {17: {...}} for display
}

export interface StoredResponse {
  txId: string;
  responseCredential: string;
  surveyTxId: string;
  surveyHash: string;
  selection?: number[];
  numericValue?: number;
  customValue?: unknown;
  slot: number;
  txIndexInBlock: number;
}

// ─── Tally Results ──────────────────────────────────────────────────
export interface OptionTally {
  index: number;
  label: string;
  count: number;
  weight: number;
}

export interface NumericTally {
  values: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  bins: { range: string; count: number }[];
}

export interface TallyResult {
  surveyTxId: string;
  totalResponses: number;
  uniqueCredentials: number;
  weighting: VoteWeighting;
  optionTallies?: OptionTally[];
  numericTally?: NumericTally;
}

// ─── Service Result Types ───────────────────────────────────────────
export interface CreateSurveyResult {
  surveyTxId: string;
  surveyHash: string;
  metadataPayload: Record<string, unknown>;
}

export interface SubmitResponseResult {
  txId: string;
  responseCredential: string;
}
