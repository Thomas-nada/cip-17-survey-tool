/**
 * Thin REST wrapper around the Blockfrost API.
 * Used by TestnetBlockchain for querying on-chain metadata.
 */

export interface BlockfrostMetadataEntry {
  tx_hash: string;
  json_metadata: Record<string, unknown> | null;
}

export interface BlockfrostBlockInfo {
  slot: number;
  height: number;
  time: number;
}

export interface BlockfrostTxInfo {
  hash: string;
  block_height: number;
  index: number;
  slot: number;
}

export class BlockfrostClient {
  private baseUrl: string;
  private projectId: string;

  constructor(projectId: string, network: 'preview' | 'mainnet' = 'preview') {
    this.projectId = projectId;
    this.baseUrl =
      network === 'preview'
        ? 'https://cardano-preview.blockfrost.io/api/v0'
        : 'https://cardano-mainnet.blockfrost.io/api/v0';
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        project_id: this.projectId,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blockfrost API error ${res.status}: ${text}`);
    }

    return res.json() as T;
  }

  /** Get metadata entries for a specific label (paginated) */
  async getMetadataByLabel(
    label: number,
    page = 1,
    count = 100
  ): Promise<BlockfrostMetadataEntry[]> {
    return this.fetch<BlockfrostMetadataEntry[]>(
      `/metadata/txs/labels/${label}?page=${page}&count=${count}`
    );
  }

  /** Get transaction metadata for a specific tx hash */
  async getTransactionMetadata(
    txHash: string
  ): Promise<{ label: string; json_metadata: Record<string, unknown> }[]> {
    return this.fetch(
      `/txs/${txHash}/metadata`
    );
  }

  /** Get transaction details */
  async getTransaction(txHash: string): Promise<BlockfrostTxInfo> {
    return this.fetch<BlockfrostTxInfo>(`/txs/${txHash}`);
  }

  /** Get latest block info */
  async getLatestBlock(): Promise<BlockfrostBlockInfo> {
    return this.fetch<BlockfrostBlockInfo>('/blocks/latest');
  }

  /** Submit a signed transaction (CBOR hex) */
  async submitTransaction(cborHex: string): Promise<string> {
    // Blockfrost submit expects Content-Type: application/cbor
    const res = await fetch(`${this.baseUrl}/tx/submit`, {
      method: 'POST',
      headers: {
        project_id: this.projectId,
        'Content-Type': 'application/cbor',
      },
      body: hexToBytes(cborHex).buffer as ArrayBuffer,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blockfrost submit error ${res.status}: ${text}`);
    }

    return res.text();
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
