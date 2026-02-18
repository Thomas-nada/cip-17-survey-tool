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
import { BrowserWallet, MeshTxBuilder } from '@meshsdk/core';

// ─── Cardano Metadata Helpers ───────────────────────────────────────
// Cardano transaction metadata strings must be ≤64 bytes.
// Longer strings are split into arrays of ≤64-byte chunks.
// This is the standard approach (same pattern as CIP-20 messages).

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
 * - Objects → recursively process values (keys are also chunked if needed)
 * - Numbers, booleans → pass through (booleans as 0/1 integers)
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
    // Cardano metadata supports integers natively.
    // Floats are not supported — convert to string if fractional.
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
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Keys are typically short, but chunk them too for safety
      const safeKey = chunkString(k, MAX_METADATA_STRING_BYTES);
      const key = safeKey.length === 1 ? safeKey[0] : safeKey.join('');
      result[key] = toCardanoMetadata(v);
    }
    return result;
  }
  return String(value);
}

// ─── Service ────────────────────────────────────────────────────────

export class TestnetBlockchain implements BlockchainService {
  readonly mode = 'testnet' as const;

  private blockfrost: BlockfrostClient;
  private connectedWalletName: string | null = null;

  constructor(
    blockfrost: BlockfrostClient,
    _getWallet: () => unknown, // kept for interface compat, we use BrowserWallet instead
    _blockfrostApiKey?: string
  ) {
    this.blockfrost = blockfrost;
  }

  /** Store which wallet name is connected so BrowserWallet can re-enable */
  setConnectedWallet(walletName: string | null) {
    this.connectedWalletName = walletName;
  }

  /**
   * Get or re-enable the BrowserWallet instance.
   * BrowserWallet wraps CIP-30 and returns parsed UTxO objects.
   */
  private async getWallet(): Promise<BrowserWallet> {
    if (!this.connectedWalletName) {
      throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');
    }
    // BrowserWallet.enable() re-uses the existing CIP-30 connection
    // (won't re-prompt the user if already authorized)
    return BrowserWallet.enable(this.connectedWalletName);
  }

  /**
   * Build, sign, and submit a transaction with label 17 metadata.
   *
   * Uses MeshTxBuilder in offline mode — UTxOs come from the wallet directly
   * via BrowserWallet.getUtxos() (already parsed), so no Blockfrost UTxO
   * lookups are needed. Coin selection is handled by selectUtxosFrom().
   */
  private async buildAndSubmitMetadataTx(
    metadataPayload: Record<string, unknown>
  ): Promise<string> {
    const wallet = await this.getWallet();

    // Get parsed UTxOs and change address from BrowserWallet
    const utxos = await wallet.getUtxos();
    if (!utxos || utxos.length === 0) {
      throw new Error(
        'No UTxOs found in wallet. Please fund your wallet with test ADA from the Cardano Testnet Faucet.'
      );
    }

    const changeAddress = await wallet.getChangeAddress();

    // Build transaction offline — no fetcher needed
    const txBuilder = new MeshTxBuilder();

    // Set change address for leftover value
    txBuilder.changeAddress(changeAddress);

    // Prepare metadata for Cardano's 64-byte string limit
    const rawContent = metadataPayload[METADATA_LABEL.toString()];
    const safeContent = toCardanoMetadata(rawContent) as object;

    // Add metadata with label 17
    txBuilder.metadataValue(METADATA_LABEL.toString(), safeContent);

    // Minimal self-payment to create a valid tx that carries metadata
    txBuilder.txOut(changeAddress, [{ unit: 'lovelace', quantity: '2000000' }]);

    // Provide wallet UTxOs for coin selection (no Blockfrost lookup)
    txBuilder.selectUtxosFrom(utxos);

    // Build the balanced transaction
    const unsignedTx = txBuilder.completeSync();

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
    // Validate
    const validation = validateSurveyDetails(details);
    if (!validation.valid) {
      throw new Error(`Invalid survey:\n${validation.errors.join('\n')}`);
    }

    const surveyHash = computeSurveyHash(details);

    // Build metadata payload
    const innerPayload: Record<string, unknown> = {
      ...(msg && msg.length > 0 ? { msg } : {}),
      surveyDetails: { ...details },
    };

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: innerPayload,
    };

    // Build, sign, and submit the transaction
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

    // Build, sign, and submit the transaction
    const txHash = await this.buildAndSubmitMetadataTx(metadataPayload);

    // Get the change address as the response credential
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
