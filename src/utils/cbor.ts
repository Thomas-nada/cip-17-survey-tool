/**
 * Canonical CBOR encoding for Label 17 survey hashing.
 *
 * Per the specification:
 * - Build envelope: {17: {"surveyDetails": <details>}}
 * - Exclude "msg" from the hash preimage
 * - Serialize as canonical CBOR (RFC 8949 deterministic map key ordering)
 *
 * We use cbor2 with CDE (Common Deterministic Encoding) options
 * which sorts map keys by encoded byte length then lexicographically.
 */
import { encode, cdeEncodeOptions } from 'cbor2';
import type { SurveyDetails, SurveyQuestion } from '../types/survey.ts';

function questionToMap(question: SurveyQuestion): Map<string, unknown> {
  const q = new Map<string, unknown>();
  q.set('questionId', question.questionId);
  q.set('question', question.question);
  q.set('methodType', question.methodType);
  if (question.options !== undefined) q.set('options', question.options);
  if (question.maxSelections !== undefined) q.set('maxSelections', question.maxSelections);
  if (question.numericConstraints !== undefined) {
    const nc = new Map<string, unknown>();
    nc.set('minValue', question.numericConstraints.minValue);
    nc.set('maxValue', question.numericConstraints.maxValue);
    if (question.numericConstraints.step !== undefined) {
      nc.set('step', question.numericConstraints.step);
    }
    q.set('numericConstraints', nc);
  }
  if (question.methodSchemaUri !== undefined) q.set('methodSchemaUri', question.methodSchemaUri);
  if (question.hashAlgorithm !== undefined) q.set('hashAlgorithm', question.hashAlgorithm);
  if (question.methodSchemaHash !== undefined) q.set('methodSchemaHash', question.methodSchemaHash);
  return q;
}

/**
 * Convert a SurveyDetails object into a Map suitable for canonical CBOR encoding.
 * We use Maps (not plain objects) to ensure cbor2 encodes them as CBOR maps
 * with proper deterministic key ordering under CDE.
 *
 * Only includes keys that are present (non-undefined) in the source.
 */
function surveyDetailsToMap(details: SurveyDetails): Map<string, unknown> {
  const m = new Map<string, unknown>();

  // Required fields
  m.set('specVersion', details.specVersion);
  m.set('title', details.title);
  m.set('description', details.description);
  if (details.questions && details.questions.length > 0) {
    m.set('questions', details.questions.map(questionToMap));
  } else {
    // Legacy single-question payload support
    m.set('question', details.question);
    m.set('methodType', details.methodType);
  }

  // Legacy single-question conditional fields
  if (!details.questions || details.questions.length === 0) {
    if (details.options !== undefined) {
      m.set('options', details.options);
    }
    if (details.maxSelections !== undefined) {
      m.set('maxSelections', details.maxSelections);
    }
    if (details.numericConstraints !== undefined) {
      const nc = new Map<string, unknown>();
      nc.set('minValue', details.numericConstraints.minValue);
      nc.set('maxValue', details.numericConstraints.maxValue);
      if (details.numericConstraints.step !== undefined) {
        nc.set('step', details.numericConstraints.step);
      }
      m.set('numericConstraints', nc);
    }
    if (details.methodSchemaUri !== undefined) {
      m.set('methodSchemaUri', details.methodSchemaUri);
    }
    if (details.hashAlgorithm !== undefined) {
      m.set('hashAlgorithm', details.hashAlgorithm);
    }
    if (details.methodSchemaHash !== undefined) {
      m.set('methodSchemaHash', details.methodSchemaHash);
    }
  }

  // Optional fields
  if (details.eligibility !== undefined) {
    m.set('eligibility', details.eligibility);
  }
  if (details.voteWeighting !== undefined) {
    m.set('voteWeighting', details.voteWeighting);
  }
  if (details.referenceAction !== undefined) {
    const ra = new Map<string, unknown>();
    ra.set('transactionId', details.referenceAction.transactionId);
    ra.set('actionIndex', details.referenceAction.actionIndex);
    m.set('referenceAction', ra);
  }
  if (details.lifecycle !== undefined) {
    const lc = new Map<string, unknown>();
    // Support both new (endEpoch) and legacy (startSlot/endSlot) formats
    const lcAny = details.lifecycle as unknown as Record<string, unknown>;
    for (const [key, val] of Object.entries(lcAny)) {
      if (val !== undefined) {
        lc.set(key, val);
      }
    }
    m.set('lifecycle', lc);
  }

  return m;
}

/**
 * Builds the CBOR hash envelope per CIP spec:
 *   { 17: { "surveyDetails": <surveyDetails as Map> } }
 *
 * The "msg" field is intentionally excluded.
 */
export function buildHashEnvelope(
  surveyDetails: SurveyDetails
): Map<number, Map<string, unknown>> {
  const innerMap = new Map<string, unknown>();
  innerMap.set('surveyDetails', surveyDetailsToMap(surveyDetails));

  const outerMap = new Map<number, Map<string, unknown>>();
  outerMap.set(17, innerMap);

  return outerMap;
}

/**
 * Encodes the envelope to canonical CBOR bytes using RFC 8949 CDE.
 */
export function encodeCanonicalCBOR(
  envelope: Map<number, Map<string, unknown>>
): Uint8Array {
  return encode(envelope, cdeEncodeOptions);
}

/**
 * Returns the full canonical CBOR bytes for a survey definition's hash envelope.
 */
export function getSurveyCBORBytes(surveyDetails: SurveyDetails): Uint8Array {
  const envelope = buildHashEnvelope(surveyDetails);
  return encodeCanonicalCBOR(envelope);
}
