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
export type VoteWeighting = 'StakeBased' | 'CredentialBased' | 'PledgeBased';
export type RoleWeighting = Partial<Record<EligibilityRole, VoteWeighting>>;

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
  // Preferred epoch-based lifecycle
  startEpoch?: number;
  endEpoch?: number;
  // Legacy slot-based lifecycle (read compatibility)
  startSlot?: number;
  endSlot?: number;
}

export interface SurveyQuestion {
  questionId: string;
  question: string;
  methodType: MethodType;
  options?: string[];
  maxSelections?: number;
  numericConstraints?: NumericConstraints;
  methodSchemaUri?: string;
  hashAlgorithm?: string;
  methodSchemaHash?: string;
}

// ─── Survey Details (label 17 surveyDetails payload) ────────────────
export interface SurveyDetails {
  specVersion: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  roleWeighting: RoleWeighting;
  endEpoch: number;
  // Legacy read compatibility only
  question?: string;
  methodType?: MethodType;
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

export interface SurveyAnswer {
  questionId: string;
  selection?: number[];
  numericValue?: number;
  customValue?: unknown;
}

// ─── Survey Response (label 17 surveyResponse payload) ──────────────
export interface SurveyResponse {
  specVersion: string;
  surveyTxId: string;
  answers: SurveyAnswer[];
  // Legacy read compatibility only
  surveyHash?: string;
  responseCredential?: string;
  proof?: {
    message: string;
    key: string;
    signature: string;
    scheme?: string;
  };
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
  responderRole: EligibilityRole;
  /** Canonical credential used for deduplication/tally display */
  responseCredential: string;
  /** Claimed credential from metadata payload (untrusted) */
  claimedCredential?: string;
  /** Optional wallet address observed from tx inputs (for stake lookups) */
  voterAddress?: string;
  /** Whether claimed identity could be verified against tx signer */
  identityVerified?: boolean;
  /** Reason identity was not verified (if any) */
  identityVerificationReason?: string;
  /** UTC timestamp in milliseconds since epoch */
  timestampMs?: number;
  /** Optional immediate snapshot from submit-time UI (lovelace string) */
  submitPowerLovelace?: string;
  surveyTxId: string;
  surveyHash?: string;
  answers?: SurveyAnswer[];
  selection?: number[];
  numericValue?: number;
  customValue?: unknown;
  slot: number;
  txIndexInBlock: number;
  metadataPosition?: number;
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

export interface QuestionTally {
  questionId: string;
  question: string;
  methodType: MethodType;
  optionTallies?: OptionTally[];
  numericTally?: NumericTally;
  customTexts?: string[];
}

export interface TallyResult {
  surveyTxId: string;
  totalResponses: number;
  uniqueCredentials: number;
  roleTallies: {
    role: EligibilityRole;
    weighting: VoteWeighting;
    totalWeight: number;
    responses: number;
    questionTallies: QuestionTally[];
  }[];
  // Backward-compatible aliases (first role)
  weighting: VoteWeighting;
  totalWeight: number;
  questionTallies: QuestionTally[];
  // Legacy single-question fields
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
