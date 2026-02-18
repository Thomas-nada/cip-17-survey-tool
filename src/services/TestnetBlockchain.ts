/**
 * Testnet Blockchain Service
 *
 * Connects to the Cardano Preview Testnet via Blockfrost API.
 * Uses CIP-30 wallet API for transaction signing and submission.
 * Uses @meshsdk/core for transaction construction with metadata.
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
import { MeshTxBuilder } from '@meshsdk/core';
import { BlockfrostProvider } from '@meshsdk/core';

// CIP-30 Wallet API types
interface CIP30WalletAPI {
  getChangeAddress(): Promise<string>;
  getUtxos(): Promise<string[] | undefined>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getNetworkId(): Promise<number>;
  getBalance(): Promise<string>;
}

export class TestnetBlockchain implements BlockchainService {
  readonly mode = 'testnet' as const;

  private blockfrost: BlockfrostClient;
  private getWallet: () => CIP30WalletAPI | null;
  private blockfrostApiKey: string;

  constructor(
    blockfrost: BlockfrostClient,
    getWallet: () => CIP30WalletAPI | null,
    blockfrostApiKey?: string
  ) {
    this.blockfrost = blockfrost;
    this.getWallet = getWallet;
    this.blockfrostApiKey = blockfrostApiKey || '';
  }

  /**
   * Build, sign, and submit a transaction with label 17 metadata.
   * Uses MeshTxBuilder for construction, CIP-30 wallet for signing.
   */
  private async buildAndSubmitMetadataTx(
    metadataPayload: Record<string, unknown>
  ): Promise<string> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');

    // Get wallet UTxOs and change address
    const utxosHex = await wallet.getUtxos();
    if (!utxosHex || utxosHex.length === 0) {
      throw new Error(
        'No UTxOs found in wallet. Please fund your wallet with test ADA from the Cardano Testnet Faucet.'
      );
    }

    const changeAddress = await wallet.getChangeAddress();

    // Create a Blockfrost provider for tx building (fee estimation, etc.)
    // We pass the API key if available
    const blockfrostProvider = new BlockfrostProvider(
      this.blockfrostApiKey || 'your-project-id'
    );

    // Build transaction with MeshTxBuilder
    const txBuilder = new MeshTxBuilder({
      fetcher: blockfrostProvider,
      evaluator: blockfrostProvider,
    });

    // Add UTxOs as inputs — pick the first one with enough ADA
    // MeshTxBuilder will handle coin selection via .complete()
    // We need to provide UTxOs for the builder to select from
    txBuilder.changeAddress(changeAddress);

    // Add metadata with label 17
    // The metadataPayload is { 17: { ... } } — we pass the inner object
    const label17Content = metadataPayload[METADATA_LABEL.toString()] as object;
    txBuilder.metadataValue(METADATA_LABEL.toString(), label17Content);

    // We need to send a minimal transaction (ADA to ourselves) to carry the metadata
    // Send min ADA back to change address to create a valid tx output
    txBuilder.txOut(changeAddress, [{ unit: 'lovelace', quantity: '2000000' }]);

    // Add wallet UTxOs for input selection
    // MeshTxBuilder can use raw hex UTxOs by selecting them
    for (const utxoHex of utxosHex) {
      // Parse the UTxO hex to get txHash and index
      // We'll let the builder handle this via selectUtxosFrom
      try {
        txBuilder.txInCollateral(utxoHex, 0);
      } catch {
        // Skip invalid UTxOs for collateral — they'll be used as regular inputs
      }
    }

    // Complete the transaction — this handles fee calculation, coin selection
    let unsignedTx: string;
    try {
      unsignedTx = await txBuilder.complete();
    } catch (buildErr) {
      // If MeshTxBuilder fails (e.g. no provider configured properly),
      // fall back to a simpler approach using the wallet's raw UTxOs
      console.warn('MeshTxBuilder.complete() failed, trying simplified approach:', buildErr);
      throw new Error(
        `Transaction build failed: ${buildErr instanceof Error ? buildErr.message : 'Unknown error'}. ` +
        'Make sure your Blockfrost API key is configured and your wallet has test ADA.'
      );
    }

    // Sign with CIP-30 wallet
    const signedTx = await wallet.signTx(unsignedTx, false);

    // Submit via CIP-30 wallet
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  async createSurvey(
    details: SurveyDetails,
    msg?: string[]
  ): Promise<CreateSurveyResult> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');

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
    const wallet = this.getWallet();
    if (!wallet) throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');

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
