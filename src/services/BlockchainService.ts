/**
 * Blockchain Service Interface
 *
 * Implemented by the active blockchain backend for this app.
 */
import type {
  SurveyDetails,
  SurveyResponse,
  StoredSurvey,
  StoredResponse,
  CreateSurveyResult,
  SubmitResponseResult,
} from '../types/survey.ts';

export interface BlockchainService {
  /** The current mode */
  readonly mode: 'mainnet' | 'testnet' | 'simulated';

  /** Submit a survey definition, returning the surveyTxId and surveyHash */
  createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult>;

  /** Submit a survey response */
  submitResponse(
    response: SurveyResponse,
    msg?: string[]
  ): Promise<SubmitResponseResult>;

  /** Fetch all known surveys */
  listSurveys(): Promise<StoredSurvey[]>;

  /** Fetch all responses for a given surveyTxId */
  getResponses(surveyTxId: string, sinceSlot?: number): Promise<StoredResponse[]>;
}
