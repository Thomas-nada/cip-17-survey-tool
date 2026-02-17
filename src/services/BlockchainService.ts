/**
 * Blockchain Service Interface
 *
 * Strategy pattern: both SimulatedBlockchain and TestnetBlockchain
 * implement this interface. The active mode determines which is used.
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
  readonly mode: 'simulated' | 'testnet';

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
  getResponses(surveyTxId: string): Promise<StoredResponse[]>;
}
