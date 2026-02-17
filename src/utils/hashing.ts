/**
 * Blake2b-256 survey hash computation per CIP-17.
 *
 * Steps:
 * 1. Build envelope {17: {"surveyDetails": <details>}} (excluding msg)
 * 2. Serialize as canonical CBOR
 * 3. Compute blake2b-256
 * 4. Return as lowercase hexadecimal string
 */
import { blake2bHex } from 'blakejs';
import { getSurveyCBORBytes } from './cbor.ts';
import type { SurveyDetails } from '../types/survey.ts';

/**
 * Compute the surveyHash for a given SurveyDetails payload.
 * Returns a 64-character lowercase hex string (blake2b-256 = 32 bytes).
 */
export function computeSurveyHash(surveyDetails: SurveyDetails): string {
  const cborBytes = getSurveyCBORBytes(surveyDetails);
  // blake2bHex(input, key, outputLength) - 32 bytes = 256 bits
  return blake2bHex(cborBytes, undefined, 32);
}

/**
 * Verify that a given hash matches the computed hash for a survey.
 */
export function verifySurveyHash(
  surveyDetails: SurveyDetails,
  expectedHash: string
): boolean {
  const computed = computeSurveyHash(surveyDetails);
  return computed === expectedHash.toLowerCase();
}
