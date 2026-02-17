/**
 * Simulated Blockchain Service
 *
 * In-memory implementation that mimics Cardano transaction behavior:
 * - Generates fake transaction IDs
 * - Computes real surveyHash using canonical CBOR + blake2b-256
 * - Tracks surveys and responses with simulated slot ordering
 * - Generates random credential hashes for responders
 */
import { v4 as uuidv4 } from 'uuid';
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
  const bytes = new Uint8Array(28); // Cardano key hashes are 28 bytes
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

  private nextSlot(): number {
    this.slotCounter += Math.floor(Math.random() * 20) + 1;
    this.txIndexCounter = 0;
    return this.slotCounter;
  }

  private nextTxIndex(): number {
    return this.txIndexCounter++;
  }

  async createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult> {
    // Validate
    const validation = validateSurveyDetails(details);
    if (!validation.valid) {
      throw new Error(
        `Invalid survey definition:\n${validation.errors.join('\n')}`
      );
    }

    // Compute hash
    const surveyHash = computeSurveyHash(details);
    const surveyTxId = randomTxId();
    const slot = this.nextSlot();

    // Build metadata payload for display
    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: {
        ...(msg && msg.length > 0 ? { msg } : {}),
        surveyDetails: { ...details },
      },
    };

    // Store
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
    // Look up the referenced survey
    const survey = this.surveys.get(response.surveyTxId);
    if (!survey) {
      throw new Error(
        `Survey not found for txId: ${response.surveyTxId}`
      );
    }

    // Verify surveyHash
    if (response.surveyHash !== survey.surveyHash) {
      throw new Error(
        `surveyHash mismatch: expected ${survey.surveyHash}, got ${response.surveyHash}`
      );
    }

    // Validate response against survey
    const validation = validateSurveyResponse(response, survey.details);
    if (!validation.valid) {
      throw new Error(
        `Invalid survey response:\n${validation.errors.join('\n')}`
      );
    }

    const txId = randomTxId();
    const responseCredential = randomCredential();
    const slot = this.nextSlot();
    const txIndex = this.nextTxIndex();

    // Ensure surveyTxId differs from response txId
    if (txId === response.surveyTxId) {
      throw new Error('Response txId must differ from surveyTxId');
    }

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
    return Array.from(this.surveys.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  async getResponses(surveyTxId: string): Promise<StoredResponse[]> {
    return this.responses.get(surveyTxId) ?? [];
  }
}
