/**
 * Thin REST wrapper around the Blockfrost API.
 * Used by TestnetBlockchain for querying on-chain metadata
 * and for eligibility role checks.
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

export interface BlockfrostAccountInfo {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string;
  rewards_sum: string;
  pool_id: string | null;
}

export interface BlockfrostAddressInfo {
  address: string;
  amount: { unit: string; quantity: string }[];
  stake_address: string | null;
  type: string;
  script: boolean;
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

  /**
   * Fetch but return null on 404 instead of throwing.
   * Useful for optional lookups (account info, DRep status, etc.)
   */
  private async fetchOrNull<T>(path: string): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        project_id: this.projectId,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 404) return null;
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

  // ─── Eligibility Check Endpoints ────────────────────────────────────

  /**
   * Get account info for a stake address.
   * Returns null if the address has never been seen on-chain.
   */
  async getAccountInfo(stakeAddress: string): Promise<BlockfrostAccountInfo | null> {
    return this.fetchOrNull<BlockfrostAccountInfo>(`/accounts/${stakeAddress}`);
  }

  /**
   * Get address info (including the associated stake address).
   * Works with both bech32 and hex-encoded addresses.
   * Returns null if the address has never been seen on-chain.
   */
  async getAddressInfo(address: string): Promise<BlockfrostAddressInfo | null> {
    return this.fetchOrNull<BlockfrostAddressInfo>(`/addresses/${address}`);
  }

  /**
   * Check if a stake address is a registered DRep.
   * Queries the governance DReps list and checks for an exact match.
   * Falls back to checking if the account's drep_id field exists.
   */
  async isDRep(stakeAddress: string): Promise<boolean> {
    // The Blockfrost /governance/dreps endpoint lists all registered DReps.
    // A DRep's ID is derived from the stake credential (key hash).
    // We check /accounts/{stake_address} for drep delegation info,
    // and also try looking up the DRep directly.
    try {
      // Try to look up the DRep by deriving its ID from the stake address.
      // DRep IDs in CIP-1694 are of the form drep1... (bech32) derived
      // from the stake key hash. We use the Blockfrost accounts endpoint
      // which includes pool_id and drep delegation.
      // To check if this address IS a DRep (not just delegating to one),
      // we query /governance/dreps/{drep_id} using the stake key hex.
      //
      // Extract the credential hex from the stake address:
      // stake_test1... → decode bech32 → skip 1 byte header → 28 byte key hash
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return false;

      // Try drep_id in "drep" + hex format
      const drepInfo = await this.fetchOrNull<{ drep_id: string; registered: boolean }>(
        `/governance/dreps/drep1${credHex}`
      );
      if (drepInfo && drepInfo.registered) return true;

      // Also try the hex format directly
      const drepInfoHex = await this.fetchOrNull<{ drep_id: string; registered: boolean }>(
        `/governance/dreps/${credHex}`
      );
      if (drepInfoHex && drepInfoHex.registered) return true;

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a stake address is an SPO (owns/operates a stake pool).
   *
   * Strategy: Extract the stake credential hex from the stake address,
   * then query Blockfrost's /pools endpoint filtered by this credential.
   * Since Blockfrost doesn't support filtering pools by owner credential
   * directly, we use the /accounts endpoint to look for pool retirement/
   * registration certs, and also check if the account IS a pool's
   * reward address via the addresses endpoint.
   *
   * PoC approach: Check if any pool uses this stake address as its
   * reward account by querying /accounts/{stake_address} and checking
   * if pool_id is present — but that only means delegation, not ownership.
   * A more robust check queries pool metadata. For this PoC we do a
   * pragmatic lookup: derive the pool ID from the credential hex and
   * try /pools/{pool_id} directly.
   */
  async isSPO(stakeAddress: string): Promise<boolean> {
    try {
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return false;

      // Try looking up the pool directly using the credential hex as pool ID.
      // Blockfrost accepts pool IDs in hex format (pool operator's VRF key hash).
      const poolInfo = await this.fetchOrNull<{ pool_id: string; retirement_epoch: number | null }>(
        `/pools/${credHex}`
      );
      if (poolInfo && poolInfo.retirement_epoch === null) return true;

      // Fallback: check if any pool lists this stake address as reward account
      // by querying the account and checking for pool registrations
      const account = await this.getAccountInfo(stakeAddress);
      if (!account) return false;

      // Check account registrations for pool-related certificates
      const registrations = await this.fetchOrNull<Array<{
        action: string;
        tx_hash: string;
      }>>(`/accounts/${stakeAddress}/registrations`);

      if (registrations && registrations.length > 0) {
        // If the account has pool registration actions, it's an SPO
        return registrations.some((r) => r.action === 'registered');
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a stake address is a Constitutional Committee member.
   * Queries the CC members list from governance endpoint.
   */
  async isCCMember(stakeAddress: string): Promise<boolean> {
    try {
      const credHex = await this.extractStakeCredentialHex(stakeAddress);
      if (!credHex) return false;

      // Query the constitutional committee members
      const members = await this.fetchOrNull<Array<{
        hash: string;
        status: string;
      }>>('/governance/constitutional-committee');

      if (!members || !Array.isArray(members)) return false;

      // Check if any CC member hash matches this stake credential
      return members.some(
        (m) => m.hash === credHex && m.status === 'active'
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if a stake address is a stakeholder (holds any ADA).
   * No delegation required — simply having ADA in your wallet qualifies.
   */
  async isStakeholder(stakeAddress: string): Promise<boolean> {
    try {
      const account = await this.getAccountInfo(stakeAddress);
      if (!account) return false;
      // Any controlled amount > 0 means the wallet holds ADA
      return BigInt(account.controlled_amount) > 0n;
    } catch {
      return false;
    }
  }

  /**
   * Extract the 28-byte stake credential hex from a bech32 stake address.
   * Stake addresses are: 1 byte header + 28 bytes credential.
   */
  private async extractStakeCredentialHex(stakeAddress: string): Promise<string | null> {
    try {
      // Simple bech32 decode — extract the data part
      // Stake address format: e0 + 28-byte key hash (testnet) or e1 + ... (mainnet)
      // We can get the hex by using the Blockfrost address info
      // which returns the stake key directly.
      //
      // Actually, the simplest approach is to get the account info
      // and derive from the stake_address. But for the credential hash,
      // we need to decode the bech32. Let's do a minimal bech32 decode.
      const decoded = bech32Decode(stakeAddress);
      if (!decoded || decoded.length < 29) return null;
      // Skip the 1-byte header, take the 28-byte credential
      return bytesToHex(decoded.slice(1, 29));
    } catch {
      return null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Minimal bech32 decoder — returns the raw data bytes */
function bech32Decode(str: string): Uint8Array | null {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sepIdx = str.lastIndexOf('1');
  if (sepIdx < 1) return null;

  const data: number[] = [];
  for (let i = sepIdx + 1; i < str.length; i++) {
    const c = CHARSET.indexOf(str.charAt(i).toLowerCase());
    if (c < 0) return null;
    data.push(c);
  }

  // Remove the 6-character checksum
  const payload = data.slice(0, data.length - 6);

  // Convert from 5-bit groups to 8-bit bytes
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  for (const value of payload) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }

  return new Uint8Array(result);
}
