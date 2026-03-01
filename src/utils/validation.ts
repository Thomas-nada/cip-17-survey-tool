/**
 * Label 17 validation logic for survey definitions and responses.
 * Enforces all method-type-specific rules from the specification.
 */
import type {
  SurveyDetails,
  SurveyResponse,
  MethodType,
  SurveyQuestion,
  SurveyAnswer,
} from '../types/survey.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX64_REGEX = /^[0-9a-fA-F]{64}$/;

function getQuestions(details: SurveyDetails): SurveyQuestion[] {
  if (details.questions && details.questions.length > 0) {
    return details.questions;
  }
  if (details.question && details.methodType) {
    return [{
      questionId: 'q1',
      question: details.question,
      methodType: details.methodType,
      options: details.options,
      maxSelections: details.maxSelections,
      numericConstraints: details.numericConstraints,
      methodSchemaUri: details.methodSchemaUri,
      hashAlgorithm: details.hashAlgorithm,
      methodSchemaHash: details.methodSchemaHash,
    }];
  }
  return [];
}

// ─── Survey Details Validation ──────────────────────────────────────

export function validateSurveyDetails(details: SurveyDetails): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!details.specVersion) errors.push('specVersion is required');
  if (!details.title) errors.push('title is required');
  if (!details.description) errors.push('description is required');
  const questions = getQuestions(details);
  if (questions.length === 0) errors.push('questions is required');

  const questionIds = new Set<string>();
  questions.forEach((q, idx) => {
    const prefix = `questions[${idx}]`;
    if (!q.questionId?.trim()) errors.push(`${prefix}.questionId is required`);
    if (!q.question?.trim()) errors.push(`${prefix}.question is required`);
    if (!q.methodType?.trim()) errors.push(`${prefix}.methodType is required`);
    if (q.questionId && questionIds.has(q.questionId)) {
      errors.push(`${prefix}.questionId must be unique`);
    }
    if (q.questionId) questionIds.add(q.questionId);

    const method = q.methodType as MethodType;
    if (method === METHOD_SINGLE_CHOICE) {
      if (!q.options || q.options.length < 2) {
        errors.push(`${prefix}: single-choice requires options with at least 2 values`);
      }
      if (q.maxSelections !== undefined && q.maxSelections !== 1) {
        errors.push(`${prefix}: single-choice maxSelections must be absent or 1`);
      }
      if (q.numericConstraints !== undefined) {
        errors.push(`${prefix}: single-choice numericConstraints must be absent`);
      }
    } else if (method === METHOD_MULTI_SELECT) {
      if (!q.options || q.options.length < 2) {
        errors.push(`${prefix}: multi-select requires options with at least 2 values`);
      }
      if (q.maxSelections === undefined || q.maxSelections < 1) {
        errors.push(`${prefix}: multi-select maxSelections is required and must be >= 1`);
      }
      if (
        q.options &&
        q.maxSelections !== undefined &&
        q.maxSelections > q.options.length
      ) {
        errors.push(`${prefix}: multi-select maxSelections must be <= number of options`);
      }
      if (q.numericConstraints !== undefined) {
        errors.push(`${prefix}: multi-select numericConstraints must be absent`);
      }
    } else if (method === METHOD_NUMERIC_RANGE) {
      if (!q.numericConstraints) {
        errors.push(`${prefix}: numeric-range requires numericConstraints`);
      } else {
        if (q.numericConstraints.minValue === undefined) {
          errors.push(`${prefix}: numericConstraints.minValue is required`);
        }
        if (q.numericConstraints.maxValue === undefined) {
          errors.push(`${prefix}: numericConstraints.maxValue is required`);
        }
        if (q.numericConstraints.minValue > q.numericConstraints.maxValue) {
          errors.push(`${prefix}: numericConstraints minValue must be <= maxValue`);
        }
        if (q.numericConstraints.step !== undefined && q.numericConstraints.step <= 0) {
          errors.push(`${prefix}: numericConstraints.step must be positive`);
        }
      }
      if (q.options !== undefined) {
        errors.push(`${prefix}: numeric-range options must be absent`);
      }
      if (q.maxSelections !== undefined) {
        errors.push(`${prefix}: numeric-range maxSelections must be absent`);
      }
    } else {
      if (!q.methodSchemaUri) {
        errors.push(`${prefix}: custom methods require methodSchemaUri`);
      }
      if (q.hashAlgorithm !== 'blake2b-256') {
        errors.push(`${prefix}: custom methods require hashAlgorithm "blake2b-256"`);
      }
      if (!q.methodSchemaHash) {
        errors.push(`${prefix}: custom methods require methodSchemaHash`);
      }
    }
  });

  // Optional field validation
  if (details.eligibility) {
    const allowed = ['DRep', 'SPO', 'CC', 'Stakeholder'];
    for (const role of details.eligibility) {
      if (!allowed.includes(role)) {
        errors.push(`Invalid eligibility role: ${role}`);
      }
    }
  }

  if (details.voteWeighting) {
    if (!['StakeBased', 'CredentialBased'].includes(details.voteWeighting)) {
      errors.push(`Invalid voteWeighting: ${details.voteWeighting}`);
    }
  }

  if (details.referenceAction) {
    if (!HEX64_REGEX.test(details.referenceAction.transactionId)) {
      errors.push('referenceAction.transactionId must be a 64-char hex string');
    }
    if (
      details.referenceAction.actionIndex === undefined ||
      details.referenceAction.actionIndex < 0 ||
      !Number.isInteger(details.referenceAction.actionIndex)
    ) {
      errors.push('referenceAction.actionIndex must be a non-negative integer');
    }
  }

  if (details.lifecycle) {
    const hasEpochLifecycle = details.lifecycle.endEpoch !== undefined || details.lifecycle.startEpoch !== undefined;
    if (hasEpochLifecycle) {
      if (
        details.lifecycle.startEpoch !== undefined &&
        (details.lifecycle.startEpoch < 0 || !Number.isInteger(details.lifecycle.startEpoch))
      ) {
        errors.push('lifecycle.startEpoch must be a non-negative integer');
      }
      if (
        details.lifecycle.endEpoch === undefined ||
        details.lifecycle.endEpoch < 0 ||
        !Number.isInteger(details.lifecycle.endEpoch)
      ) {
        errors.push('lifecycle.endEpoch must be a non-negative integer');
      }
      if (
        details.lifecycle.startEpoch !== undefined &&
        details.lifecycle.endEpoch !== undefined &&
        details.lifecycle.endEpoch < details.lifecycle.startEpoch
      ) {
        errors.push('lifecycle.endEpoch must be >= lifecycle.startEpoch');
      }
    } else {
      // Legacy slot-based validation for older payloads
      if (
        details.lifecycle.startSlot !== undefined &&
        (details.lifecycle.startSlot < 0 || !Number.isInteger(details.lifecycle.startSlot))
      ) {
        errors.push('lifecycle.startSlot must be a non-negative integer');
      }
      if (
        details.lifecycle.endSlot === undefined ||
        details.lifecycle.endSlot < 0 ||
        !Number.isInteger(details.lifecycle.endSlot)
      ) {
        errors.push('lifecycle.endSlot must be a non-negative integer');
      }
      if (
        details.lifecycle.startSlot !== undefined &&
        details.lifecycle.endSlot !== undefined &&
        details.lifecycle.endSlot < details.lifecycle.startSlot
      ) {
        errors.push('lifecycle.endSlot must be >= lifecycle.startSlot');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Survey Response Validation ─────────────────────────────────────

export function validateSurveyResponse(
  response: SurveyResponse,
  survey: SurveyDetails
): ValidationResult {
  const errors: string[] = [];

  if (!response.specVersion) errors.push('specVersion is required');
  if (!HEX64_REGEX.test(response.surveyTxId)) {
    errors.push('surveyTxId must be a 64-char hex string');
  }
  if (!HEX64_REGEX.test(response.surveyHash)) {
    errors.push('surveyHash must be a 64-char hex string');
  }

  const questions = getQuestions(survey);
  const questionById = new Map(questions.map((q) => [q.questionId, q]));

  const answers: SurveyAnswer[] = response.answers && response.answers.length > 0
    ? response.answers
    : [{
        questionId: questions[0]?.questionId ?? 'q1',
        selection: response.selection,
        numericValue: response.numericValue,
        customValue: response.customValue,
      }];

  if (answers.length === 0) {
    errors.push('answers must be non-empty');
    return { valid: false, errors };
  }

  const seenAnswerIds = new Set<string>();
  for (const [idx, answer] of answers.entries()) {
    const prefix = `answers[${idx}]`;
    if (!answer.questionId) {
      errors.push(`${prefix}.questionId is required`);
      continue;
    }
    if (seenAnswerIds.has(answer.questionId)) {
      errors.push(`${prefix}.questionId must be unique`);
      continue;
    }
    seenAnswerIds.add(answer.questionId);

    const question = questionById.get(answer.questionId);
    if (!question) {
      errors.push(`${prefix}.questionId "${answer.questionId}" does not exist in survey`);
      continue;
    }

    const hasSelection = answer.selection !== undefined;
    const hasNumeric = answer.numericValue !== undefined;
    const hasCustom = answer.customValue !== undefined;
    const valueCount = [hasSelection, hasNumeric, hasCustom].filter(Boolean).length;
    if (valueCount !== 1) {
      errors.push(`${prefix}: exactly one of selection, numericValue, customValue is required`);
      continue;
    }

    const method = question.methodType;
    if (method === METHOD_SINGLE_CHOICE) {
      if (!hasSelection) {
        errors.push(`${prefix}: single-choice answer must use selection`);
      } else if (answer.selection!.length !== 1) {
        errors.push(`${prefix}: single-choice must have exactly 1 selection`);
      } else {
        const idxVal = answer.selection![0];
        if (question.options && (idxVal < 0 || idxVal >= question.options.length)) {
          errors.push(`${prefix}: selection index ${idxVal} is out of range`);
        }
      }
    } else if (method === METHOD_MULTI_SELECT) {
      if (!hasSelection) {
        errors.push(`${prefix}: multi-select answer must use selection`);
      } else {
        if (
          question.maxSelections !== undefined &&
          answer.selection!.length > question.maxSelections
        ) {
          errors.push(`${prefix}: too many selections`);
        }
        for (const idxVal of answer.selection!) {
          if (question.options && (idxVal < 0 || idxVal >= question.options.length)) {
            errors.push(`${prefix}: selection index ${idxVal} is out of range`);
          }
        }
      }
    } else if (method === METHOD_NUMERIC_RANGE) {
      if (!hasNumeric) {
        errors.push(`${prefix}: numeric-range answer must use numericValue`);
      } else if (question.numericConstraints) {
        const val = answer.numericValue!;
        const { minValue, maxValue, step } = question.numericConstraints;
        if (val < minValue || val > maxValue) {
          errors.push(`${prefix}: numericValue ${val} outside [${minValue}, ${maxValue}]`);
        }
        if (step !== undefined && (val - minValue) % step !== 0) {
          errors.push(`${prefix}: numericValue ${val} violates step ${step}`);
        }
      }
    } else if (!hasCustom) {
      errors.push(`${prefix}: free-text/custom answer must use customValue`);
    }
  }

  return { valid: errors.length === 0, errors };
}
