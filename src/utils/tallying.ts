/**
 * Label 17 Tallying Logic
 *
 * Implements:
 * - Response deduplication by voter key (latest-valid-response-wins)
 * - Chain ordering: (slot, txIndexInBlock)
 * - Weighting modes: CredentialBased (weight=1) and StakeBased (weight=stake)
 * - Multi-question tallies (questions[] + answers[])
 */
import type {
  SurveyDetails,
  SurveyQuestion,
  SurveyAnswer,
  StoredResponse,
  TallyResult,
  OptionTally,
  NumericTally,
  VoteWeighting,
  QuestionTally,
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

export function tallySurveyResponses(
  survey: SurveyDetails,
  responses: StoredResponse[],
  weighting: VoteWeighting = 'CredentialBased',
  stakeMap?: Map<string, bigint>
): TallyResult {
  const questions = getQuestions(survey);
  const questionById = new Map(questions.map((q) => [q.questionId, q]));
  const voterKey = (resp: StoredResponse) => resp.voterAddress ?? resp.responseCredential;
  const getStakeLovelace = (resp: StoredResponse): bigint | undefined => {
    if (!stakeMap) return undefined;
    const byTx = stakeMap.get(resp.txId);
    if (byTx !== undefined) return byTx;
    const byCredential = stakeMap.get(resp.responseCredential);
    if (byCredential !== undefined) return byCredential;
    if (resp.voterAddress) return stakeMap.get(resp.voterAddress);
    return undefined;
  };
  const verifiableResponses = responses.filter((r) => r.identityVerified !== false);

  const sorted = [...verifiableResponses].sort((a, b) => {
    if (a.slot !== b.slot) return a.slot - b.slot;
    return a.txIndexInBlock - b.txIndexInBlock;
  });

  const latestByVoter = new Map<string, StoredResponse>();
  for (const resp of sorted) latestByVoter.set(voterKey(resp), resp);
  const deduplicated = Array.from(latestByVoter.values());

  const questionTallies: QuestionTally[] = questions.map((q) => ({
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

  const numericValuesByQuestion = new Map<string, number[]>();

  for (const resp of deduplicated) {
    const weight = weighting === 'StakeBased' && stakeMap
      ? Number(getStakeLovelace(resp) ?? 0n) / 1_000_000
      : 1;
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
  if (weighting === 'StakeBased' && stakeMap) {
    for (const resp of deduplicated) {
      totalWeight += Number(getStakeLovelace(resp) ?? 0n) / 1_000_000;
    }
  } else {
    totalWeight = deduplicated.length;
  }

  const legacySingle = questionTallies[0];
  return {
    surveyTxId: verifiableResponses[0]?.surveyTxId ?? responses[0]?.surveyTxId ?? '',
    totalResponses: responses.length,
    uniqueCredentials: deduplicated.length,
    weighting,
    totalWeight,
    questionTallies,
    optionTallies: legacySingle?.optionTallies,
    numericTally: legacySingle?.numericTally,
  };
}
