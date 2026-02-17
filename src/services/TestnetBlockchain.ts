/**
 * Testnet Blockchain Service
 *
 * Connects to the Cardano Preview Testnet via Blockfrost API.
 * Uses CIP-30 wallet API for transaction signing and submission.
 *
 * NOTE: This is a proof-of-concept implementation. For production use,
 * proper error handling, retry logic, and wallet compatibility testing
 * would be needed.
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
import { BlockfrostClient } from './BlockfrostClient.ts';
import { computeSurveyHash } from '../utils/hashing.ts';
import { validateSurveyDetails } from '../utils/validation.ts';
import { METADATA_LABEL } from '../constants/methodTypes.ts';

// CIP-30 Wallet API types
interface CIP30WalletAPI {
  getChangeAddress(): Promise<string>;
  getUtxos(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
}

export class TestnetBlockchain implements BlockchainService {
  readonly mode = 'testnet' as const;

  private blockfrost: BlockfrostClient;
  private getWallet: () => CIP30WalletAPI | null;

  constructor(
    blockfrost: BlockfrostClient,
    getWallet: () => CIP30WalletAPI | null
  ) {
    this.blockfrost = blockfrost;
    this.getWallet = getWallet;
  }

  async createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('Wallet not connected');

    // Validate
    const validation = validateSurveyDetails(details);
    if (!validation.valid) {
      throw new Error(`Invalid survey:\n${validation.errors.join('\n')}`);
    }

    const surveyHash = computeSurveyHash(details);

    // Build metadata payload
    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: {
        ...(msg && msg.length > 0 ? { msg } : {}),
        surveyDetails: { ...details },
      },
    };

    // For PoC: In a full implementation, we'd use MeshTxBuilder or
    // cardano-serialization-lib to construct the transaction with metadata.
    // For now, we demonstrate the payload format and hash computation.
    throw new Error(
      'Testnet transaction submission requires @meshsdk/core integration. ' +
      'The survey payload and hash have been computed successfully.\n\n' +
      `Survey Hash: ${surveyHash}\n` +
      `Payload: ${JSON.stringify(metadataPayload, null, 2)}\n\n` +
      'To submit on testnet, integrate @meshsdk/core MeshTxBuilder with .metadataValue(17, payload).'
    );
  }

  async submitResponse(
    response: SurveyResponse,
    msg?: string[]
  ): Promise<SubmitResponseResult> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('Wallet not connected');

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: {
        ...(msg && msg.length > 0 ? { msg } : {}),
        surveyResponse: { ...response },
      },
    };

    throw new Error(
      'Testnet transaction submission requires @meshsdk/core integration. ' +
      'The response payload has been prepared.\n\n' +
      `Payload: ${JSON.stringify(metadataPayload, null, 2)}`
    );
  }

  async listSurveys(): Promise<StoredSurvey[]> {
    try {
      const entries = await this.blockfrost.getMetadataByLabel(METADATA_LABEL);
      const surveys: StoredSurvey[] = [];

      for (const entry of entries) {
        if (
          entry.json_metadata &&
          typeof entry.json_metadata === 'object' &&
          'surveyDetails' in entry.json_metadata
        ) {
          try {
            const details = entry.json_metadata.surveyDetails as SurveyDetails;
            const surveyHash = computeSurveyHash(details);
            const txInfo = await this.blockfrost.getTransaction(entry.tx_hash);

            surveys.push({
              surveyTxId: entry.tx_hash,
              surveyHash,
              details,
              msg: (entry.json_metadata as Record<string, unknown>).msg as string[] | undefined,
              createdAt: txInfo.slot,
              metadataPayload: { [METADATA_LABEL]: entry.json_metadata },
            });
          } catch {
            // Skip invalid entries
            console.warn(`Skipping invalid survey in tx ${entry.tx_hash}`);
          }
        }
      }

      return surveys.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      console.error('Failed to list surveys from Blockfrost:', err);
      return [];
    }
  }

  async getResponses(surveyTxId: string): Promise<StoredResponse[]> {
    try {
      const entries = await this.blockfrost.getMetadataByLabel(METADATA_LABEL);
      const responses: StoredResponse[] = [];

      for (const entry of entries) {
        if (
          entry.json_metadata &&
          typeof entry.json_metadata === 'object' &&
          'surveyResponse' in entry.json_metadata
        ) {
          const resp = entry.json_metadata.surveyResponse as SurveyResponse;
          if (resp.surveyTxId === surveyTxId) {
            try {
              const txInfo = await this.blockfrost.getTransaction(entry.tx_hash);
              responses.push({
                txId: entry.tx_hash,
                responseCredential: 'on-chain', // Would need to derive from tx data
                surveyTxId: resp.surveyTxId,
                surveyHash: resp.surveyHash,
                selection: resp.selection,
                numericValue: resp.numericValue,
                customValue: resp.customValue,
                slot: txInfo.slot,
                txIndexInBlock: txInfo.index,
              });
            } catch {
              console.warn(`Skipping response in tx ${entry.tx_hash}`);
            }
          }
        }
      }

      return responses;
    } catch (err) {
      console.error('Failed to get responses from Blockfrost:', err);
      return [];
    }
  }
}
