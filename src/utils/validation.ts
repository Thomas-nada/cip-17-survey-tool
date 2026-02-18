/**
 * Label 17 validation logic for survey definitions and responses.
 * Enforces all method-type-specific rules from the specification.
 */
import type {
  SurveyDetails,
  SurveyResponse,
  MethodType,
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

// ─── Survey Details Validation ──────────────────────────────────────

export function validateSurveyDetails(details: SurveyDetails): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!details.specVersion) errors.push('specVersion is required');
  if (!details.title) errors.push('title is required');
  if (!details.description) errors.push('description is required');
  if (!details.question) errors.push('question is required');
  if (!details.methodType) errors.push('methodType is required');

  // Method-specific validation
  const method = details.methodType as MethodType;

  if (method === METHOD_SINGLE_CHOICE) {
    if (!details.options || details.options.length < 2) {
      errors.push('single-choice requires options with at least 2 values');
    }
    if (details.maxSelections !== undefined && details.maxSelections !== 1) {
      errors.push('single-choice: maxSelections must be absent or 1');
    }
    if (details.numericConstraints !== undefined) {
      errors.push('single-choice: numericConstraints must be absent');
    }
  } else if (method === METHOD_MULTI_SELECT) {
    if (!details.options || details.options.length < 2) {
      errors.push('multi-select requires options with at least 2 values');
    }
    if (details.maxSelections === undefined || details.maxSelections < 1) {
      errors.push('multi-select: maxSelections is required and must be >= 1');
    }
    if (
      details.options &&
      details.maxSelections !== undefined &&
      details.maxSelections > details.options.length
    ) {
      errors.push('multi-select: maxSelections must be <= number of options');
    }
    if (details.numericConstraints !== undefined) {
      errors.push('multi-select: numericConstraints must be absent');
    }
  } else if (method === METHOD_NUMERIC_RANGE) {
    if (!details.numericConstraints) {
      errors.push('numeric-range requires numericConstraints');
    } else {
      if (details.numericConstraints.minValue === undefined) {
        errors.push('numericConstraints.minValue is required');
      }
      if (details.numericConstraints.maxValue === undefined) {
        errors.push('numericConstraints.maxValue is required');
      }
      if (details.numericConstraints.minValue > details.numericConstraints.maxValue) {
        errors.push('numericConstraints: minValue must be <= maxValue');
      }
      if (
        details.numericConstraints.step !== undefined &&
        details.numericConstraints.step <= 0
      ) {
        errors.push('numericConstraints.step must be a positive integer');
      }
    }
    if (details.options !== undefined) {
      errors.push('numeric-range: options must be absent');
    }
    if (details.maxSelections !== undefined) {
      errors.push('numeric-range: maxSelections must be absent');
    }
  } else {
    // Custom method type
    if (!details.methodSchemaUri) {
      errors.push('Custom methods require methodSchemaUri');
    }
    if (details.hashAlgorithm !== 'blake2b-256') {
      errors.push('Custom methods require hashAlgorithm set to "blake2b-256"');
    }
    if (!details.methodSchemaHash) {
      errors.push('Custom methods require methodSchemaHash');
    }
  }

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
    if (details.lifecycle.endEpoch < 0 || !Number.isInteger(details.lifecycle.endEpoch)) {
      errors.push('lifecycle: endEpoch must be a non-negative integer');
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

  // Exactly one response value must be present
  const hasSelection = response.selection !== undefined;
  const hasNumeric = response.numericValue !== undefined;
  const hasCustom = response.customValue !== undefined;
  const valueCount = [hasSelection, hasNumeric, hasCustom].filter(Boolean).length;

  if (valueCount !== 1) {
    errors.push(
      'Exactly one of selection, numericValue, or customValue must be present'
    );
    return { valid: false, errors };
  }

  const method = survey.methodType;

  if (method === METHOD_SINGLE_CHOICE) {
    if (!hasSelection) {
      errors.push('single-choice response must use selection');
    } else if (response.selection!.length !== 1) {
      errors.push('single-choice response must have exactly 1 selection');
    } else {
      const idx = response.selection![0];
      if (survey.options && (idx < 0 || idx >= survey.options.length)) {
        errors.push(`Selection index ${idx} is out of range`);
      }
    }
  } else if (method === METHOD_MULTI_SELECT) {
    if (!hasSelection) {
      errors.push('multi-select response must use selection');
    } else {
      if (
        survey.maxSelections !== undefined &&
        response.selection!.length > survey.maxSelections
      ) {
        errors.push(
          `Too many selections: ${response.selection!.length} > maxSelections ${survey.maxSelections}`
        );
      }
      for (const idx of response.selection!) {
        if (survey.options && (idx < 0 || idx >= survey.options.length)) {
          errors.push(`Selection index ${idx} is out of range`);
        }
      }
    }
  } else if (method === METHOD_NUMERIC_RANGE) {
    if (!hasNumeric) {
      errors.push('numeric-range response must use numericValue');
    } else if (survey.numericConstraints) {
      const val = response.numericValue!;
      const { minValue, maxValue, step } = survey.numericConstraints;
      if (val < minValue || val > maxValue) {
        errors.push(
          `numericValue ${val} is outside range [${minValue}, ${maxValue}]`
        );
      }
      if (step !== undefined && (val - minValue) % step !== 0) {
        errors.push(
          `numericValue ${val} does not satisfy step constraint (step=${step}, base=${minValue})`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
