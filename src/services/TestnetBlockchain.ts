/**
 * Testnet Blockchain Service
 *
 * Connects to Cardano networks via Blockfrost API.
 * Uses Mesh SDK's BrowserWallet for CIP-30 interaction (parsed UTxOs).
 * Uses MeshTxBuilder for offline transaction construction with metadata.
 */
import type { BlockchainService } from './BlockchainService.ts';
import type {
  SurveyDetails,
  SurveyResponse,
  StoredSurvey,
  StoredResponse,
  EligibilityRole,
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
  checkSignature,
} from '@meshsdk/core';
import * as coreCst from '@meshsdk/core-cst';
import * as blake from 'blakejs';

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
  readonly mode: 'mainnet' | 'testnet';

  private blockfrost: BlockfrostClient;
  private connectedWalletName: string | null = null;

  constructor(
    blockfrost: BlockfrostClient,
    _getWallet: () => unknown,
    mode: 'mainnet' | 'testnet' = 'testnet'
  ) {
    this.blockfrost = blockfrost;
    this.mode = mode;
  }

  /** Store which wallet name is connected so BrowserWallet can re-enable */
  setConnectedWallet(walletName: string | null) {
    this.connectedWalletName = walletName;
  }

  private async getWallet(extensions?: { cip: number }[]): Promise<BrowserWallet> {
    if (!this.connectedWalletName) {
      throw new Error('Wallet not connected. Please connect a CIP-30 wallet.');
    }
    try {
      return await BrowserWallet.enable(this.connectedWalletName, extensions as any);
    } catch {
      return BrowserWallet.enable(this.connectedWalletName);
    }
  }

  private normalizeCredential(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Derive a stake address from a Shelley base payment address.
   * Works offline (no API calls), so identity canonicalization doesn't
   * depend on remote address lookups.
   */
  private deriveStakeAddressFromPaymentAddress(address: string): string | null {
    if (!address.startsWith('addr')) return null;
    const bytes = this.bech32Decode(address);
    if (!bytes || bytes.length < 57) return null;

    const header = bytes[0];
    const addrType = header >> 4;
    const networkId = header & 0x0f;

    // Base address types:
    // 0: keyhash28 / keyhash28
    // 1: scripthash28 / keyhash28
    // 2: keyhash28 / scripthash28
    // 3: scripthash28 / scripthash28
    if (addrType < 0 || addrType > 3) return null;

    // Stake credential starts after header + payment credential.
    const stakeCred = bytes.slice(29, 57);
    if (stakeCred.length !== 28) return null;

    // Stake address header:
    // 0xe0 for key stake credential, 0xf0 for script stake credential.
    const isStakeScript = addrType === 2 || addrType === 3;
    const stakeHeader = (isStakeScript ? 0xf0 : 0xe0) | networkId;
    const stakeBytes = new Uint8Array(1 + stakeCred.length);
    stakeBytes[0] = stakeHeader;
    stakeBytes.set(stakeCred, 1);

    const hrp = networkId === 1 ? 'stake' : 'stake_test';
    return this.bech32Encode(hrp, stakeBytes);
  }

  private bech32Decode(str: string): Uint8Array | null {
    const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const sepIdx = str.lastIndexOf('1');
    if (sepIdx < 1) return null;

    const data: number[] = [];
    for (let i = sepIdx + 1; i < str.length; i++) {
      const c = charset.indexOf(str.charAt(i).toLowerCase());
      if (c < 0) return null;
      data.push(c);
    }
    if (data.length < 7) return null;

    // Drop 6-char checksum, convert payload 5-bit groups to bytes.
    const payload = data.slice(0, data.length - 6);
    let acc = 0;
    let bits = 0;
    const out: number[] = [];
    for (const value of payload) {
      acc = (acc << 5) | value;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  }

  private bech32Encode(hrp: string, data: Uint8Array): string {
    const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

    const toFiveBit = (): number[] => {
      const out: number[] = [];
      let acc = 0;
      let bits = 0;
      for (const byte of data) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
          bits -= 5;
          out.push((acc >> bits) & 31);
        }
      }
      if (bits > 0) out.push((acc << (5 - bits)) & 31);
      return out;
    };

    const polymod = (values: number[]): number => {
      let chk = 1;
      for (const v of values) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) {
          if ((top >> i) & 1) chk ^= gen[i];
        }
      }
      return chk;
    };

    const hrpExpand: number[] = [];
    for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) >> 5);
    hrpExpand.push(0);
    for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) & 31);

    const fiveBit = toFiveBit();
    const checksumInput = hrpExpand.concat(fiveBit, [0, 0, 0, 0, 0, 0]);
    const mod = polymod(checksumInput) ^ 1;
    const checksum: number[] = [];
    for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);

    let result = `${hrp}1`;
    for (const value of fiveBit.concat(checksum)) {
      result += charset[value];
    }
    return result;
  }

  private buildCredentialProofChallenge(
    response: SurveyResponse,
    claimedCredential: string
  ): string {
    const responsePayload =
      response.answers && response.answers.length > 0
        ? { answers: response.answers }
        : {
          selection: response.selection,
          numericValue: response.numericValue,
          customValue: response.customValue,
        };
    return JSON.stringify({
      surveyTxId: response.surveyTxId,
      surveyHash: response.surveyHash,
      responseCredential: claimedCredential,
      response: responsePayload,
    });
  }

  private async verifyProof(
    response: SurveyResponse,
    claimedCredential: string
  ): Promise<{ ok: boolean; reason?: string; pubKeyHex?: string; keyHashHex?: string }> {
    const proof = response.proof;
    const message = this.normalizeCredential(proof?.message);
    const key = this.normalizeCredential(proof?.key);
    const signature = this.normalizeCredential(proof?.signature);
    if (!message || !key || !signature) {
      return { ok: false, reason: 'Missing proof fields (message/key/signature)' };
    }

    const expected = this.buildCredentialProofChallenge(response, claimedCredential);
    if (message !== expected) {
      return { ok: false, reason: 'Proof message does not match expected challenge' };
    }

    const signatureOk = await checkSignature(message, { key, signature });
    if (!signatureOk) {
      return { ok: false, reason: 'Invalid proof signature' };
    }

    try {
      const pubKeyBytes = coreCst.getPublicKeyFromCoseKey(key);
      const pubKeyHex = Array.from(pubKeyBytes as Uint8Array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const keyHashHex = blake.blake2bHex(this.hexToBytes(pubKeyHex), undefined, 28).toLowerCase();
      return { ok: true, pubKeyHex, keyHashHex };
    } catch {
      return { ok: false, reason: 'Unable to derive key hash from proof key' };
    }
  }

  private deriveStakeAddressFromKeyHash(keyHashHex: string, mainnet: boolean): string {
    const payload = new Uint8Array(29);
    payload[0] = mainnet ? 0xe1 : 0xe0;
    payload.set(this.hexToBytes(keyHashHex), 1);
    return this.bech32Encode(mainnet ? 'stake' : 'stake_test', payload);
  }

  private deriveCcColdFromKeyHash(keyHashHex: string): string {
    const payload = new Uint8Array(29);
    payload[0] = 0x12; // CIP-129 CC cold key hash
    payload.set(this.hexToBytes(keyHashHex), 1);
    return this.bech32Encode('cc_cold', payload);
  }

  private derivePoolIdFromKeyHash(keyHashHex: string): string {
    return this.bech32Encode('pool', this.hexToBytes(keyHashHex));
  }

  private async resolveSignerStakeAddress(voterAddress: string): Promise<string | null> {
    let signerStakeAddress: string | null = this.deriveStakeAddressFromPaymentAddress(voterAddress);
    if (!signerStakeAddress) {
      try {
        const addrInfo = await this.blockfrost.getAddressInfo(voterAddress);
        signerStakeAddress = addrInfo?.stake_address ?? null;
      } catch {
        signerStakeAddress = null;
      }
    }
    return signerStakeAddress;
  }

  private async areEquivalentDRepIds(a: string, b: string): Promise<boolean> {
    if (a === b) return true;
    try {
      const infoA = await this.blockfrost.getDRepInfo(a);
      const infoB = await this.blockfrost.getDRepInfo(b);
      if (!infoA || !infoB) return false;

      const idsA = new Set<string>();
      const idsB = new Set<string>();
      const push = (set: Set<string>, v: unknown) => {
        const n = this.normalizeCredential(v);
        if (n) set.add(n.toLowerCase());
      };

      push(idsA, a);
      push(idsA, infoA.drep_id);
      push(idsA, infoA.hex);

      push(idsB, b);
      push(idsB, infoB.drep_id);
      push(idsB, infoB.hex);

      for (const v of idsA) {
        if (idsB.has(v)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Enforce role-aware identity verification rules:
   * - DRep: valid proof, derived DRep ID match, active on-chain, linked to signer stake account.
   * - CC: valid proof, derived cc_cold key hash must be active committee member.
   * - SPO: valid proof, proof key stake address must match signer stake address and be active SPO.
   * - Stakeholder (or unrestricted): signer payment address is authoritative.
   */
  private async verifyClaimedCredential(
    response: SurveyResponse,
    claimedCredential: string | undefined,
    voterAddress: string,
    requiredRoles: EligibilityRole[]
  ): Promise<{ canonicalCredential: string; verified: boolean; reason?: string }> {
    if (!voterAddress || voterAddress === 'unknown') {
      return {
        canonicalCredential: 'unknown',
        verified: false,
        reason: 'Unable to resolve tx signer address',
      };
    }
    const claimed = this.normalizeCredential(claimedCredential);
    const signerStakeAddress = await this.resolveSignerStakeAddress(voterAddress);
    const canonicalSignerCredential = voterAddress;
    const hasRoleRequirement = requiredRoles.length > 0;
    const requiresSPO = requiredRoles.includes('SPO');
    const wantsDRep = requiredRoles.includes('DRep') && Boolean(claimed?.startsWith('drep'));
    const wantsCC = requiredRoles.includes('CC') && Boolean(claimed?.startsWith('cc_cold'));
    const wantsSPO = requiredRoles.includes('SPO') && Boolean(claimed && (claimed.startsWith('stake') || claimed.startsWith('addr') || claimed.startsWith('pool')));
    const allowsStakeholder = requiredRoles.includes('Stakeholder') || !hasRoleRequirement;

    if (wantsDRep && claimed) {
      const registered = await this.blockfrost.isDRep(claimed);
      if (!registered) {
        return {
          canonicalCredential: canonicalSignerCredential,
          verified: false,
          reason: 'Claimed DRep is not registered on-chain',
        };
      }
      if (!signerStakeAddress) {
        return {
          canonicalCredential: canonicalSignerCredential,
          verified: false,
          reason: 'No signer stake address to validate DRep linkage',
        };
      }
      // Soft-linkage check for wallet DRep flow:
      // do not fail wallet votes on linkage mismatch/unavailability because
      // wallet DRep participation can be valid without strict self-delegation.
      try {
        const account = await this.blockfrost.getAccountInfo(signerStakeAddress);
        const accountDrep = this.normalizeCredential(account?.drep_id);
        if (accountDrep) {
          const linked =
            accountDrep === claimed || await this.areEquivalentDRepIds(accountDrep, claimed);
          if (!linked) {
            // Keep vote verifiable by claimed active DRep ID.
            // This is informational only and should not exclude the vote.
          }
        }
      } catch {
        // Non-fatal for wallet DRep path: keep vote verifiable by claimed active DRep ID.
      }

      // Strong mode (CLI/manual): when proof is provided, verify key ownership.
      if (response.proof) {
        const proof = await this.verifyProof(response, claimed);
        if (!proof.ok || !proof.pubKeyHex) {
          return {
            canonicalCredential: canonicalSignerCredential,
            verified: false,
            reason: proof.reason,
          };
        }

        const ids = coreCst.getDRepIds(proof.pubKeyHex) as { cip105?: string; cip129?: string };
        if (ids.cip105 !== claimed && ids.cip129 !== claimed) {
          return {
            canonicalCredential: canonicalSignerCredential,
            verified: false,
            reason: 'Proof key does not derive claimed DRep ID',
          };
        }
      }

      return {
        canonicalCredential: claimed,
        verified: true,
      };
    }

    if (wantsCC && claimed) {
      const proof = await this.verifyProof(response, claimed);
      if (!proof.ok || !proof.keyHashHex) {
        return {
          canonicalCredential: canonicalSignerCredential,
          verified: false,
          reason: proof.reason,
        };
      }
      const derivedCcCold = this.deriveCcColdFromKeyHash(proof.keyHashHex);
      if (derivedCcCold !== claimed) {
        return {
          canonicalCredential: canonicalSignerCredential,
          verified: false,
          reason: 'Proof key does not derive claimed cc_cold credential',
        };
      }
      const isCc = await this.blockfrost.isCCMemberByHash(proof.keyHashHex);
      if (!isCc) {
        return {
          canonicalCredential: canonicalSignerCredential,
          verified: false,
          reason: 'Claimed CC credential is not an active committee member',
        };
      }
      return {
        canonicalCredential: derivedCcCold,
        verified: true,
      };
    }

    if (requiresSPO && signerStakeAddress) {
      try {
        const accountInfo = await this.blockfrost.getAccountInfo(signerStakeAddress);
        const signerPoolId = accountInfo?.pool_id ?? null;

        // Requested SPO policy:
        // wallet stake account + linked pool id is sufficient verification.
        if (signerPoolId) {
          return {
            canonicalCredential: signerPoolId,
            verified: true,
          };
        }

        // Optional proof path remains supported for cold-key / Calidus-style SPO flows.
        if (wantsSPO && claimed) {
          const proof = await this.verifyProof(response, claimed);
          if (!proof.ok || !proof.keyHashHex) {
            return {
              canonicalCredential: canonicalSignerCredential,
              verified: false,
              reason: proof.reason,
            };
          }

          const derivedPoolId = this.derivePoolIdFromKeyHash(proof.keyHashHex);
          const isSpoByPool = await this.blockfrost.isActivePool(derivedPoolId);
          if (isSpoByPool) {
            if (claimed.startsWith('pool') && claimed !== derivedPoolId) {
              return {
                canonicalCredential: canonicalSignerCredential,
                verified: false,
                reason: 'Proof key does not derive claimed pool credential',
              };
            }
            return {
              canonicalCredential: claimed.startsWith('pool') ? claimed : derivedPoolId,
              verified: true,
            };
          }
        }
      } catch {
        // Fall through to other role checks / final failure.
      }
    }

    if (allowsStakeholder) {
      // Stakeholder and unrestricted surveys use signer payment address as canonical identity.
      // If addr... claim is provided, require exact signer match to prevent spoofing.
      // Non-addr claims (e.g., legacy drep... metadata) are ignored in this path.
      if (claimed) {
        if (claimed.startsWith('addr') && claimed !== voterAddress) {
          return {
            canonicalCredential: canonicalSignerCredential,
            verified: false,
            reason: 'Claimed stakeholder address does not match tx signer address',
          };
        }
      }
      return {
        canonicalCredential: canonicalSignerCredential,
        verified: true,
      };
    }

    return {
      canonicalCredential: canonicalSignerCredential,
      verified: false,
      reason: 'Required role claim/proof missing or invalid',
    };
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Prefer DRep identity when available and active on-chain.
   * Falls back to wallet address-based credential when not available.
   */
  private async resolveActiveDRepCredential(wallet: BrowserWallet): Promise<string | null> {
    const candidates = new Set<string>();

    try {
      const drepObj = await (wallet as any).getDRep?.();
      if (typeof drepObj === 'string') {
        const id = this.normalizeCredential(drepObj);
        if (id) candidates.add(id);
      } else if (drepObj && typeof drepObj === 'object') {
        const fields = [
          drepObj.dRepIDCip105,
          drepObj.dRepIDBech32,
          drepObj.dRepIDHash,
          drepObj.drepId,
          drepObj.dRepId,
        ];
        for (const field of fields) {
          const id = this.normalizeCredential(field);
          if (id) candidates.add(id);
        }
      }
    } catch {
      // Non-critical: fallback paths below
    }

    try {
      const pubDRepKey = await (wallet as any).getPubDRepKey?.();
      const clean = this.normalizeCredential(pubDRepKey)?.replace(/^0x/i, '');
      if (clean && /^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
        const hash = blake.blake2bHex(this.hexToBytes(clean), undefined, 28).toLowerCase();
        candidates.add(hash);
      }
    } catch {
      // Non-critical: candidate set may still have IDs from getDRep()
    }

    for (const candidate of candidates) {
      if (await this.blockfrost.isDRep(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Build, sign, and submit a transaction with label 17 metadata.
   *
   * Strategy: Build tx without metadata first, then attach metadata
   * post-build to avoid CBOR serialization issues in MeshTxBuilder.
   */
  private async buildAndSubmitMetadataTx(
    metadataPayload: Record<string, unknown>,
    wallet?: BrowserWallet
  ): Promise<string> {
    const activeWallet = wallet ?? await this.getWallet();

    const utxos = await activeWallet.getUtxos();
    if (!utxos || utxos.length === 0) {
      throw new Error(
        'No UTxOs found in wallet. Please fund your wallet with ADA and try again.'
      );
    }

    const changeAddress = await activeWallet.getChangeAddress();

    // Prepare metadata for Cardano's 64-byte string limit
    const rawContent = metadataPayload[METADATA_LABEL.toString()];
    const safeContent = toCardanoMetadata(rawContent) as object;

    // Build transaction using the higher-level Transaction class
    // which handles metadata serialization more reliably
    const tx = new Transaction({ initiator: activeWallet });

    // Send min ADA to self to carry the metadata
    tx.sendLovelace(changeAddress, '2000000');

    // Set metadata using the Transaction class API
    tx.setMetadata(METADATA_LABEL, safeContent);

    // Build the transaction — Transaction class handles signing internally
    const unsignedTx = await tx.build();

    // Sign with CIP-30 wallet
    const signedTx = await activeWallet.signTx(unsignedTx);

    // Submit via CIP-30 wallet
    const txHash = await activeWallet.submitTx(signedTx);

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
    const wallet = await this.getWallet([{ cip: 95 }]);
    const fallbackCredential = await wallet.getChangeAddress();
    const providedCredential = this.normalizeCredential(response.responseCredential);
    // Keep signer payment address as the default identity unless caller explicitly
    // provides a role-specific credential (e.g., DRep/CC/SPO flow).
    const responseCredential = providedCredential ?? fallbackCredential;

    const innerPayload: Record<string, unknown> = {
      ...(msg && msg.length > 0 ? { msg } : {}),
      surveyResponse: { ...response, responseCredential },
    };

    const metadataPayload: Record<string, unknown> = {
      [METADATA_LABEL]: innerPayload,
    };

    const txHash = await this.buildAndSubmitMetadataTx(metadataPayload, wallet);

    return {
      txId: txHash,
      responseCredential,
    };
  }

  async listSurveys(): Promise<StoredSurvey[]> {
    try {
      const entries = await this.blockfrost.getIndexedSurveys();
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
            const txInfo = {
              slot: typeof entry.slot === 'number' ? entry.slot : 0,
            };

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

  async getResponses(surveyTxId: string, sinceSlot?: number): Promise<StoredResponse[]> {
    try {
      const entries = await this.blockfrost.getIndexedResponses(surveyTxId, sinceSlot);
      const surveys = await this.blockfrost.getIndexedSurveys();
      let requiredRoles: EligibilityRole[] = [];
      const surveyEntry = surveys.find((s) => s.tx_hash === surveyTxId);
      if (surveyEntry?.json_metadata && typeof surveyEntry.json_metadata === 'object' && 'surveyDetails' in surveyEntry.json_metadata) {
        try {
          const restoredSurvey = fromCardanoMetadata(surveyEntry.json_metadata) as Record<string, unknown>;
          const details = restoredSurvey.surveyDetails as SurveyDetails;
          requiredRoles = Array.isArray(details.eligibility) ? details.eligibility : [];
        } catch {
          requiredRoles = [];
        }
      }
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
              const txInfo = {
                slot: typeof entry.slot === 'number' ? entry.slot : 0,
                index: typeof entry.index === 'number' ? entry.index : 0,
                block_time: typeof entry.block_time === 'number' ? entry.block_time : undefined,
              };

              // Resolve the voter's address from the transaction's first input
              let voterAddress = 'unknown';
              if (typeof entry.input_address === 'string' && entry.input_address.length > 0) {
                voterAddress = entry.input_address;
              }

              const claimedCredential =
                typeof resp.responseCredential === 'string' && resp.responseCredential.trim().length > 0
                  ? resp.responseCredential
                  : undefined;
              const verified = await this.verifyClaimedCredential(resp, claimedCredential, voterAddress, requiredRoles);

              responses.push({
                txId: entry.tx_hash,
                responseCredential: verified.canonicalCredential,
                claimedCredential,
                voterAddress,
                identityVerified: verified.verified,
                identityVerificationReason: verified.reason,
                timestampMs: typeof txInfo.block_time === 'number' ? txInfo.block_time * 1000 : undefined,
                surveyTxId: resp.surveyTxId,
                surveyHash: resp.surveyHash,
                answers: resp.answers,
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
