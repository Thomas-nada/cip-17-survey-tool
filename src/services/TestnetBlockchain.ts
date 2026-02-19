/**
 * Testnet Blockchain Service
 *
 * Connects to the Cardano Preview Testnet via Blockfrost API.
 * Uses Mesh SDK's BrowserWallet for CIP-30 interaction (parsed UTxOs).
 * Uses MeshTxBuilder for offline transaction construction with metadata.
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
import {
  BrowserWallet,
  Transaction,
} from '@meshsdk/core';

// ─── Cardano Metadata Helpers ───────────────────────────────────────
// Cardano transaction metadata strings must be ≤64 bytes.
// Longer strings are split into arrays of ≤64-byte chunks.

const MAX_METADATA_STRING_BYTES = 64;

/**
 * Split a string into chunks of at most `maxBytes` UTF-8 bytes.
 * Splits on byte boundaries, never in the middle of a multi-byte char.
 */
function chunkString(str: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= maxBytes) return [str];

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let offset = 0;
  while (offset < encoded.length) {
    let end = Math.min(offset + maxBytes, encoded.length);
    // Don't split in the middle of a multi-byte UTF-8 sequence
    while (end > offset && (encoded[end] & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(decoder.decode(encoded.slice(offset, end)));
    offset = end;
  }
  return chunks;
}

/**
 * Recursively prepare a JS value for Cardano transaction metadata.
 * - Strings >64 bytes → array of ≤64 byte chunks
 * - Arrays → recursively process elements
 * - Objects → recursively process values
 * - Numbers, booleans → pass through (booleans as 0/1 integers)
 * - undefined/null → stripped from objects (not valid in Cardano metadata)
 */
function toCardanoMetadata(value: unknown): unknown {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const chunks = chunkString(value, MAX_METADATA_STRING_BYTES);
    return chunks.length === 1 ? chunks[0] : chunks;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value;
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.map(toCardanoMetadata);
  }
  if (typeof value === 'object') {
    // Use a Map to preserve insertion order and be explicit about types
    const result = new Map<string, unknown>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Skip undefined values — Cardano metadata can't represent them
      if (v === undefined) continue;
      result.set(k, toCardanoMetadata(v));
    }
    return result;
  }
  return String(value);
}

/**
 * Reverse of toCardanoMetadata: reassemble chunked string arrays back
 * into regular strings, and convert Maps/objects recursively.
 * Blockfrost returns metadata as JSON objects — chunked strings appear
 * as arrays of short strings that need to be joined.
 */
function fromCardanoMetadata(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    // Heuristic: if every element is a string, this is likely a chunked
    // string that was split for the 64-byte limit — rejoin it.
    // Exception: if the original field is known to be a string[] (like
    // options or msg), we should NOT join. We detect this by checking
    // if any element looks like a 64-byte chunk boundary (close to 64 bytes).
    // For safety, we only auto-join if ALL strings are ≤64 bytes and
    // at least one is exactly 64 bytes (suggesting it was chunked).
    const allStrings = value.every((v) => typeof v === 'string');
    if (allStrings && value.length > 1) {
      const encoder = new TextEncoder();
      const hasChunkBoundary = value.some(
        (s) => encoder.encode(s as string).length === MAX_METADATA_STRING_BYTES
      );
      if (hasChunkBoundary) {
        return (value as string[]).join('');
      }
    }
    // Otherwise, recurse into each element
    return value.map(fromCardanoMetadata);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = fromCardanoMetadata(v);
    }
    return result;
  }

  return value;
}

// ─── Service ────────────────────────────────────────────────────────

export class TestnetBlockchain implements BlockchainService {
  readonly mode = 'testnet' as const;

  private blockfrost: BlockfrostClient;
  private connectedWalletName: string | null = null;

  constructor(
    blockfrost: BlockfrostClient,
    _getWallet: () => unknown,
    _blockfrostApiKey?: string
  ) {
    this.blockfrost = blockfrost;
  }

  /** Store which wallet name is connected so BrowserWallet can re-enable */
  setConnectedWallet(walletName: string | null) {
    this.connectedWalletName = walletName;
  }

  private async getWallet(): Promise<BrowserWallet> {
    if (!this.connectedWalletName) {
      throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');
    }
    return BrowserWallet.enable(this.connectedWalletName);
  }

  /**
   * Build, sign, and submit a transaction with label 17 metadata.
   *
   * Strategy: Build tx without metadata first, then attach metadata
   * post-build to avoid CBOR serialization issues in MeshTxBuilder.
   */
  private async buildAndSubmitMetadataTx(
    metadataPayload: Record<string, unknown>
  ): Promise<string> {
    const wallet = await this.getWallet();

    const utxos = await wallet.getUtxos();
    if (!utxos || utxos.length === 0) {
      throw new Error(
        'No UTxOs found in wallet. Please fund your wallet with test ADA from the Cardano Testnet Faucet.'
      );
    }

    const changeAddress = await wallet.getChangeAddress();

    // Prepare metadata for Cardano's 64-byte string limit
    const rawContent = metadataPayload[METADATA_LABEL.toString()];
    const safeContent = toCardanoMetadata(rawContent) as object;

    // Build transaction using the higher-level Transaction class
    // which handles metadata serialization more reliably
    const tx = new Transaction({ initiator: wallet });

    // Send min ADA to self to carry the metadata
    tx.sendLovelace(changeAddress, '2000000');

    // Set metadata using the Transaction class API
    tx.setMetadata(METADATA_LABEL, safeContent);

    // Build the transaction — Transaction class handles signing internally
    const unsignedTx = await tx.build();

    // Sign with CIP-30 wallet
    const signedTx = await wallet.signTx(unsignedTx);

    // Submit via CIP-30 wallet
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  async createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult> {
    const validation = validateSurveyDetails(details);
    if (!validation.valid) {
      throw new Error(`Invalid survey:\n${validation.errors.join('\n')}`);
    }

    const surveyHash = computeSurveyHash(details);

    const innerPayload: Record<string, unknown> = {
      ...(msg && msg.length > 0 ? { msg } : {}),
      surveyDetails: { ...details },
    };

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: innerPayload,
    };

    const txHash = await this.buildAndSubmitMetadataTx(metadataPayload);

    return {
      surveyTxId: txHash,
      surveyHash,
      metadataPayload,
    };
  }

  async submitResponse(
    response: SurveyResponse,
    msg?: string[]
  ): Promise<SubmitResponseResult> {
    const wallet = await this.getWallet();

    const innerPayload: Record<string, unknown> = {
      ...(msg && msg.length > 0 ? { msg } : {}),
      surveyResponse: { ...response },
    };

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: innerPayload,
    };

    const txHash = await this.buildAndSubmitMetadataTx(metadataPayload);
    const changeAddress = await wallet.getChangeAddress();

    return {
      txId: txHash,
      responseCredential: changeAddress,
    };
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
            // Reassemble chunked metadata strings from Blockfrost
            const restored = fromCardanoMetadata(entry.json_metadata) as Record<string, unknown>;
            const details = restored.surveyDetails as SurveyDetails;
            const surveyHash = computeSurveyHash(details);
            const txInfo = await this.blockfrost.getTransaction(entry.tx_hash);

            surveys.push({
              surveyTxId: entry.tx_hash,
              surveyHash,
              details,
              msg: restored.msg as string[] | undefined,
              createdAt: txInfo.slot,
              metadataPayload: { [METADATA_LABEL]: restored },
            });
          } catch (e) {
            console.warn(`Skipping invalid survey in tx ${entry.tx_hash}`, e);
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
          // Reassemble chunked metadata strings from Blockfrost
          const restored = fromCardanoMetadata(entry.json_metadata) as Record<string, unknown>;
          const resp = restored.surveyResponse as SurveyResponse;
          if (resp.surveyTxId === surveyTxId) {
            try {
              const txInfo = await this.blockfrost.getTransaction(entry.tx_hash);
              responses.push({
                txId: entry.tx_hash,
                responseCredential: 'on-chain',
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
