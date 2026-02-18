/**
 * Simulated Blockchain Service
 *
 * In-memory implementation that mimics Cardano transaction behavior:
 * - Generates fake transaction IDs
 * - Computes real surveyHash using canonical CBOR + blake2b-256
 * - Tracks surveys and responses with simulated slot ordering
 * - Pre-populates with realistic demo data on init
 */
import type { BlockchainService } from './BlockchainService.ts';
import type {
  SurveyDetails,
  SurveyResponse,
  StoredSurvey,
  StoredResponse,
  CreateSurveyResult,
  SubmitResponseResult,
} from '../types/survey.ts';
import { computeSurveyHash } from '../utils/hashing.ts';
import { validateSurveyDetails, validateSurveyResponse } from '../utils/validation.ts';
import { METADATA_LABEL } from '../constants/methodTypes.ts';
import { SEED_SURVEYS } from './seedData.ts';

/** Generate a random 64-character hex string (simulated txId) */
function randomTxId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a random credential key hash */
function randomCredential(): string {
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class SimulatedBlockchain implements BlockchainService {
  readonly mode = 'simulated' as const;

  private surveys: Map<string, StoredSurvey> = new Map();
  private responses: Map<string, StoredResponse[]> = new Map();
  private slotCounter = 100_000_000;
  private txIndexCounter = 0;
  private _seeded = false;

  private nextSlot(): number {
    this.slotCounter += Math.floor(Math.random() * 20) + 1;
    this.txIndexCounter = 0;
    return this.slotCounter;
  }

  private nextTxIndex(): number {
    return this.txIndexCounter++;
  }

  /** Seed the blockchain with demo surveys and responses. Returns the seeded data. */
  seed(): { surveys: StoredSurvey[]; responses: Map<string, StoredResponse[]> } {
    if (this._seeded) {
      return {
        surveys: Array.from(this.surveys.values()).sort((a, b) => b.createdAt - a.createdAt),
        responses: new Map(this.responses),
      };
    }

    for (const seedItem of SEED_SURVEYS) {
      const surveyHash = computeSurveyHash(seedItem.details);
      const surveyTxId = randomTxId();
      const slot = this.nextSlot();

      const metadataPayload: Record<string, unknown> = {
        [METADATA_LABEL]: {
          msg: seedItem.msg,
          surveyDetails: { ...seedItem.details },
        },
      };

      const stored: StoredSurvey = {
        surveyTxId,
        surveyHash,
        details: { ...seedItem.details },
        msg: seedItem.msg,
        createdAt: slot,
        metadataPayload,
      };
      this.surveys.set(surveyTxId, stored);

      const responses: StoredResponse[] = [];
      for (const resp of seedItem.responses) {
        const respSlot = this.nextSlot();
        responses.push({
          txId: randomTxId(),
          responseCredential: randomCredential(),
          surveyTxId,
          surveyHash,
          selection: resp.selection,
          numericValue: resp.numericValue,
          slot: respSlot,
          txIndexInBlock: this.nextTxIndex(),
        });
      }
      this.responses.set(surveyTxId, responses);
    }

    this._seeded = true;
    return {
      surveys: Array.from(this.surveys.values()).sort((a, b) => b.createdAt - a.createdAt),
      responses: new Map(this.responses),
    };
  }

  async createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult> {
    const validation = validateSurveyDetails(details);
    if (!validation.valid) {
      throw new Error(`Invalid survey definition:\n${validation.errors.join('\n')}`);
    }

    const surveyHash = computeSurveyHash(details);
    const surveyTxId = randomTxId();
    const slot = this.nextSlot();

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: {
        ...(msg && msg.length > 0 ? { msg } : {}),
        surveyDetails: { ...details },
      },
    };

    const stored: StoredSurvey = {
      surveyTxId,
      surveyHash,
      details: { ...details },
      msg,
      createdAt: slot,
      metadataPayload,
    };
    this.surveys.set(surveyTxId, stored);

    return { surveyTxId, surveyHash, metadataPayload };
  }

  async submitResponse(
    response: SurveyResponse,
    msg?: string[]
  ): Promise<SubmitResponseResult> {
    const survey = this.surveys.get(response.surveyTxId);
    if (!survey) {
      throw new Error(`Survey not found for txId: ${response.surveyTxId}`);
    }

    if (response.surveyHash !== survey.surveyHash) {
      throw new Error(`surveyHash mismatch: expected ${survey.surveyHash}, got ${response.surveyHash}`);
    }

    const validation = validateSurveyResponse(response, survey.details);
    if (!validation.valid) {
      throw new Error(`Invalid survey response:\n${validation.errors.join('\n')}`);
    }

    const txId = randomTxId();
    const responseCredential = randomCredential();
    const slot = this.nextSlot();
    const txIndex = this.nextTxIndex();

    const stored: StoredResponse = {
      txId,
      responseCredential,
      surveyTxId: response.surveyTxId,
      surveyHash: response.surveyHash,
      selection: response.selection,
      numericValue: response.numericValue,
      customValue: response.customValue,
      slot,
      txIndexInBlock: txIndex,
    };

    const existing = this.responses.get(response.surveyTxId) ?? [];
    existing.push(stored);
    this.responses.set(response.surveyTxId, existing);

    return { txId, responseCredential };
  }

  async listSurveys(): Promise<StoredSurvey[]> {
    return Array.from(this.surveys.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getResponses(surveyTxId: string): Promise<StoredResponse[]> {
    return this.responses.get(surveyTxId) ?? [];
  }
}
