/**
 * Label 17 validation logic for survey definitions and responses.
 * Enforces CIP method rules and role-weighting constraints.
 */
import type {
  SurveyDetails,
  SurveyResponse,
  MethodType,
  SurveyQuestion,
  SurveyAnswer,
  EligibilityRole,
  VoteWeighting,
  RoleWeighting,
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

function isBuiltinMethod(method: MethodType): boolean {
  return method === METHOD_SINGLE_CHOICE ||
    method === METHOD_MULTI_SELECT ||
    method === METHOD_NUMERIC_RANGE;
}

function getQuestions(details: SurveyDetails): SurveyQuestion[] {
  if (Array.isArray(details.questions) && details.questions.length > 0) {
    return details.questions;
  }
  // Legacy read compatibility
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

function validateRoleWeighting(roleWeighting: RoleWeighting | undefined): string[] {
  const errors: string[] = [];
  if (!roleWeighting || typeof roleWeighting !== 'object') {
    errors.push('roleWeighting is required');
    return errors;
  }

  const keys = Object.keys(roleWeighting) as EligibilityRole[];
  if (keys.length === 0) {
    errors.push('roleWeighting must include at least one role');
    return errors;
  }

  const allowedRoles: EligibilityRole[] = ['DRep', 'SPO', 'CC', 'Stakeholder'];
  for (const role of keys) {
    if (!allowedRoles.includes(role)) {
      errors.push(`Invalid roleWeighting role: ${role}`);
      continue;
    }

    const mode = roleWeighting[role] as VoteWeighting | undefined;
    if (!mode) {
      errors.push(`roleWeighting.${role} is required`);
      continue;
    }

    if (role === 'CC' && mode !== 'CredentialBased') {
      errors.push('roleWeighting.CC must be CredentialBased');
    }
    if (role === 'DRep' && !['CredentialBased', 'StakeBased'].includes(mode)) {
      errors.push('roleWeighting.DRep must be CredentialBased or StakeBased');
    }
    if (role === 'SPO' && !['CredentialBased', 'StakeBased', 'PledgeBased'].includes(mode)) {
      errors.push('roleWeighting.SPO must be CredentialBased, StakeBased, or PledgeBased');
    }
    if (role === 'Stakeholder' && mode !== 'StakeBased') {
      errors.push('roleWeighting.Stakeholder must be StakeBased');
    }
  }

  return errors;
}

// ─── Survey Details Validation ──────────────────────────────────────

export function validateSurveyDetails(details: SurveyDetails): ValidationResult {
  const errors: string[] = [];

  if (!details.specVersion) errors.push('specVersion is required');
  if (!details.title?.trim()) errors.push('title is required');
  if (!details.description?.trim()) errors.push('description is required');

  if (details.endEpoch === undefined || !Number.isInteger(details.endEpoch) || details.endEpoch < 0) {
    errors.push('endEpoch must be a non-negative integer');
  }

  errors.push(...validateRoleWeighting(details.roleWeighting));

  const questions = getQuestions(details);
  if (questions.length === 0) {
    errors.push('questions is required and must be non-empty');
    return { valid: false, errors };
  }

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
      if (!Number.isInteger(q.maxSelections) || (q.maxSelections ?? 0) < 1) {
        errors.push(`${prefix}: multi-select maxSelections is required and must be >= 1`);
      }
      if (q.options && q.maxSelections !== undefined && q.maxSelections > q.options.length) {
        errors.push(`${prefix}: multi-select maxSelections must be <= number of options`);
      }
      if (q.numericConstraints !== undefined) {
        errors.push(`${prefix}: multi-select numericConstraints must be absent`);
      }
    } else if (method === METHOD_NUMERIC_RANGE) {
      if (!q.numericConstraints) {
        errors.push(`${prefix}: numeric-range requires numericConstraints`);
      } else {
        const { minValue, maxValue, step } = q.numericConstraints;
        if (!Number.isInteger(minValue)) {
          errors.push(`${prefix}: numericConstraints.minValue must be an integer`);
        }
        if (!Number.isInteger(maxValue)) {
          errors.push(`${prefix}: numericConstraints.maxValue must be an integer`);
        }
        if (minValue > maxValue) {
          errors.push(`${prefix}: numericConstraints minValue must be <= maxValue`);
        }
        if (step !== undefined && (!Number.isInteger(step) || step <= 0)) {
          errors.push(`${prefix}: numericConstraints.step must be a positive integer`);
        }
      }
      if (q.options !== undefined) {
        errors.push(`${prefix}: numeric-range options must be absent`);
      }
      if (q.maxSelections !== undefined) {
        errors.push(`${prefix}: numeric-range maxSelections must be absent`);
      }
    } else {
      if (!q.methodSchemaUri?.trim()) {
        errors.push(`${prefix}: custom methods require methodSchemaUri`);
      }
      if (q.hashAlgorithm !== 'blake2b-256') {
        errors.push(`${prefix}: custom methods require hashAlgorithm "blake2b-256"`);
      }
      if (!q.methodSchemaHash?.trim()) {
        errors.push(`${prefix}: custom methods require methodSchemaHash`);
      } else if (!HEX64_REGEX.test(q.methodSchemaHash)) {
        errors.push(`${prefix}: methodSchemaHash must be a 64-char hex string`);
      }
    }

    // Built-ins must not include custom schema fields.
    if (isBuiltinMethod(method)) {
      if (q.methodSchemaUri !== undefined) {
        errors.push(`${prefix}: built-in methods must not include methodSchemaUri`);
      }
      if (q.hashAlgorithm !== undefined) {
        errors.push(`${prefix}: built-in methods must not include hashAlgorithm`);
      }
      if (q.methodSchemaHash !== undefined) {
        errors.push(`${prefix}: built-in methods must not include methodSchemaHash`);
      }
    }
  });

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

  const questions = getQuestions(survey);
  const questionById = new Map(questions.map((q) => [q.questionId, q]));
  const answers: SurveyAnswer[] = response.answers ?? [];

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
        if (!Number.isInteger(idxVal) || idxVal < 0) {
          errors.push(`${prefix}: selection index must be a non-negative integer`);
        } else if (question.options && idxVal >= question.options.length) {
          errors.push(`${prefix}: selection index ${idxVal} is out of range`);
        }
      }
    } else if (method === METHOD_MULTI_SELECT) {
      if (!hasSelection) {
        errors.push(`${prefix}: multi-select answer must use selection`);
      } else {
        if (question.maxSelections !== undefined && answer.selection!.length > question.maxSelections) {
          errors.push(`${prefix}: too many selections`);
        }
        for (const idxVal of answer.selection!) {
          if (!Number.isInteger(idxVal) || idxVal < 0) {
            errors.push(`${prefix}: selection index must be a non-negative integer`);
            continue;
          }
          if (question.options && idxVal >= question.options.length) {
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
        if (!Number.isInteger(val)) {
          errors.push(`${prefix}: numericValue must be an integer`);
        } else {
          if (val < minValue || val > maxValue) {
            errors.push(`${prefix}: numericValue ${val} outside [${minValue}, ${maxValue}]`);
          }
          if (step !== undefined && (val - minValue) % step !== 0) {
            errors.push(`${prefix}: numericValue ${val} violates step ${step}`);
          }
        }
      }
    } else if (!hasCustom) {
      errors.push(`${prefix}: custom method answer must use customValue`);
    }
  }

  return { valid: errors.length === 0, errors };
}
