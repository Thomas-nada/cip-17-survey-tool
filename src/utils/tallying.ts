import type {
  SurveyDetails,
  SurveyQuestion,
  SurveyAnswer,
  StoredResponse,
  TallyResult,
  VoteWeighting,
  QuestionTally,
  EligibilityRole,
} from '../types/survey.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

function getQuestions(survey: SurveyDetails): SurveyQuestion[] {
  if (survey.questions && survey.questions.length > 0) return survey.questions;
  if (survey.question && survey.methodType) {
    return [{
      questionId: 'q1',
      question: survey.question,
      methodType: survey.methodType,
      options: survey.options,
      maxSelections: survey.maxSelections,
      numericConstraints: survey.numericConstraints,
      methodSchemaUri: survey.methodSchemaUri,
      hashAlgorithm: survey.hashAlgorithm,
      methodSchemaHash: survey.methodSchemaHash,
    }];
  }
  return [];
}

function getAnswers(resp: StoredResponse): SurveyAnswer[] {
  if (resp.answers && resp.answers.length > 0) return resp.answers;
  const hasLegacy =
    resp.selection !== undefined ||
    resp.numericValue !== undefined ||
    resp.customValue !== undefined;
  if (!hasLegacy) return [];
  return [{
    questionId: 'q1',
    selection: resp.selection,
    numericValue: resp.numericValue,
    customValue: resp.customValue,
  }];
}

function emptyQuestionTallies(questions: SurveyQuestion[]): QuestionTally[] {
  return questions.map((q) => ({
    questionId: q.questionId,
    question: q.question,
    methodType: q.methodType,
    optionTallies:
      q.methodType === METHOD_SINGLE_CHOICE || q.methodType === METHOD_MULTI_SELECT
        ? (q.options ?? []).map((label, index) => ({ index, label, count: 0, weight: 0 }))
        : undefined,
    numericTally: undefined,
    customTexts: q.methodType !== METHOD_SINGLE_CHOICE &&
      q.methodType !== METHOD_MULTI_SELECT &&
      q.methodType !== METHOD_NUMERIC_RANGE
      ? []
      : undefined,
  }));
}

function tallyForRole(
  questions: SurveyQuestion[],
  responses: StoredResponse[],
  weighting: VoteWeighting,
  stakeMap?: Map<string, bigint>
): { questionTallies: QuestionTally[]; totalWeight: number } {
  const questionTallies = emptyQuestionTallies(questions);
  const questionById = new Map(questions.map((q) => [q.questionId, q]));
  const numericValuesByQuestion = new Map<string, number[]>();

  const getWeight = (resp: StoredResponse): number => {
    if (weighting === 'CredentialBased') return 1;
    if (weighting === 'StakeBased') {
      if (!stakeMap) return 0;
      const byTx = stakeMap.get(resp.txId);
      const byCredential = stakeMap.get(resp.responseCredential);
      const byAddress = resp.voterAddress ? stakeMap.get(resp.voterAddress) : undefined;
      return Number(byTx ?? byCredential ?? byAddress ?? 0n) / 1_000_000;
    }
    // PledgeBased (SPO-only) - use explicit pledge key when available.
    if (!stakeMap) return 0;
    return Number(stakeMap.get(`pledge:${resp.responseCredential}`) ?? 0n) / 1_000_000;
  };

  for (const resp of responses) {
    const weight = getWeight(resp);
    const answers = getAnswers(resp);
    for (const answer of answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;
      const qt = questionTallies.find((x) => x.questionId === answer.questionId);
      if (!qt) continue;

      if (question.methodType === METHOD_SINGLE_CHOICE || question.methodType === METHOD_MULTI_SELECT) {
        if (!answer.selection || !qt.optionTallies) continue;
        for (const idx of answer.selection) {
          if (idx >= 0 && idx < qt.optionTallies.length) {
            qt.optionTallies[idx].count += 1;
            qt.optionTallies[idx].weight += weight;
          }
        }
      } else if (question.methodType === METHOD_NUMERIC_RANGE) {
        if (answer.numericValue === undefined) continue;
        const list = numericValuesByQuestion.get(question.questionId) ?? [];
        list.push(answer.numericValue);
        numericValuesByQuestion.set(question.questionId, list);
      } else if (answer.customValue !== undefined && qt.customTexts) {
        qt.customTexts.push(
          typeof answer.customValue === 'string'
            ? answer.customValue
            : JSON.stringify(answer.customValue)
        );
      }
    }
  }

  for (const qt of questionTallies) {
    const q = questionById.get(qt.questionId);
    if (!q || q.methodType !== METHOD_NUMERIC_RANGE) continue;
    const values = numericValuesByQuestion.get(q.questionId) ?? [];
    if (values.length === 0) {
      qt.numericTally = { values: [], mean: 0, median: 0, min: 0, max: 0, bins: [] };
      continue;
    }
    const sortedVals = [...values].sort((a, b) => a - b);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const median = values.length % 2 === 0
      ? (sortedVals[values.length / 2 - 1] + sortedVals[values.length / 2]) / 2
      : sortedVals[Math.floor(values.length / 2)];
    const nc = q.numericConstraints!;
    const range = nc.maxValue - nc.minValue;
    const binCount = Math.max(1, Math.min(10, range + 1));
    const binSize = range / binCount || 1;
    const bins: { range: string; count: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const lo = nc.minValue + i * binSize;
      const hi = i === binCount - 1 ? nc.maxValue : nc.minValue + (i + 1) * binSize;
      const label = `${Math.round(lo)}-${Math.round(hi)}`;
      const count = values.filter((v) => (i === binCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length;
      bins.push({ range: label, count });
    }
    qt.numericTally = {
      values,
      mean,
      median,
      min: sortedVals[0],
      max: sortedVals[sortedVals.length - 1],
      bins,
    };
  }

  let totalWeight = 0;
  for (const resp of responses) totalWeight += getWeight(resp);
  return { questionTallies, totalWeight };
}

export function tallySurveyResponses(
  survey: SurveyDetails,
  responses: StoredResponse[],
  _weighting: VoteWeighting = 'CredentialBased',
  stakeMap?: Map<string, bigint>
): TallyResult {
  const questions = getQuestions(survey);
  const verifiableResponses = responses.filter((r) => r.identityVerified !== false);

  const sorted = [...verifiableResponses].sort((a, b) => {
    if (a.slot !== b.slot) return a.slot - b.slot;
    if (a.txIndexInBlock !== b.txIndexInBlock) return a.txIndexInBlock - b.txIndexInBlock;
    return (a.metadataPosition ?? 0) - (b.metadataPosition ?? 0);
  });

  const latestByTuple = new Map<string, StoredResponse>();
  for (const resp of sorted) {
    const key = `${resp.responderRole}|${resp.responseCredential}`;
    latestByTuple.set(key, resp);
  }
  const deduplicated = Array.from(latestByTuple.values());

  const roleWeighting = survey.roleWeighting ?? {};
  const configuredRoles = Object.keys(roleWeighting) as EligibilityRole[];
  const roleTallies = configuredRoles.map((role) => {
    const roleResponses = deduplicated.filter((r) => r.responderRole === role);
    const weighting = roleWeighting[role] as VoteWeighting;
    const { questionTallies, totalWeight } = tallyForRole(questions, roleResponses, weighting, stakeMap);
    return {
      role,
      weighting,
      totalWeight,
      responses: roleResponses.length,
      questionTallies,
    };
  });

  const firstRole = roleTallies[0];
  const firstQuestion = firstRole?.questionTallies?.[0];
  return {
    surveyTxId: deduplicated[0]?.surveyTxId ?? responses[0]?.surveyTxId ?? '',
    totalResponses: responses.length,
    uniqueCredentials: deduplicated.length,
    roleTallies,
    weighting: firstRole?.weighting ?? 'CredentialBased',
    totalWeight: firstRole?.totalWeight ?? 0,
    questionTallies: firstRole?.questionTallies ?? [],
    optionTallies: firstQuestion?.optionTallies,
    numericTally: firstQuestion?.numericTally,
  };
}
