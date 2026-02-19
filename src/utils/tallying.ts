/**
 * Label 17 Tallying Logic
 *
 * Implements:
 * - Response deduplication by responseCredential (latest-valid-response-wins)
 * - Chain ordering: (slot, txIndexInBlock)
 * - Weighting modes: CredentialBased (weight=1) and StakeBased (weight=stake)
 */
import type {
  SurveyDetails,
  StoredResponse,
  TallyResult,
  OptionTally,
  NumericTally,
  VoteWeighting,
} from '../types/survey.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

/**
 * Tally all valid responses for a survey.
 *
 * @param stakeMap - For StakeBased weighting, a map of responseCredential → lovelace (bigint).
 *   If not provided, StakeBased falls back to weight=1 per voter.
 */
export function tallySurveyResponses(
  survey: SurveyDetails,
  responses: StoredResponse[],
  weighting: VoteWeighting = 'CredentialBased',
  stakeMap?: Map<string, bigint>
): TallyResult {
  // 1. Sort by chain ordering (slot asc, then txIndexInBlock asc)
  const sorted = [...responses].sort((a, b) => {
    if (a.slot !== b.slot) return a.slot - b.slot;
    return a.txIndexInBlock - b.txIndexInBlock;
  });

  // 2. Deduplicate: latest response per credential wins
  const latestByCredential = new Map<string, StoredResponse>();
  for (const resp of sorted) {
    latestByCredential.set(resp.responseCredential, resp);
  }

  const deduplicated = Array.from(latestByCredential.values());
  const method = survey.methodType;

  // 3. Compute tallies based on method type
  let optionTallies: OptionTally[] | undefined;
  let numericTally: NumericTally | undefined;

  if (method === METHOD_SINGLE_CHOICE || method === METHOD_MULTI_SELECT) {
    const options = survey.options ?? [];
    const tallies: OptionTally[] = options.map((label, index) => ({
      index,
      label,
      count: 0,
      weight: 0,
    }));

    for (const resp of deduplicated) {
      // CredentialBased: 1 vote per credential
      // StakeBased: weight = ADA amount (lovelace / 1_000_000)
      let weight = 1;
      if (weighting === 'StakeBased' && stakeMap) {
        const lovelace = stakeMap.get(resp.responseCredential);
        weight = lovelace ? Number(lovelace) / 1_000_000 : 0;
      }
      if (resp.selection) {
        for (const idx of resp.selection) {
          if (idx >= 0 && idx < tallies.length) {
            tallies[idx].count += 1;
            tallies[idx].weight += weight;
          }
        }
      }
    }

    optionTallies = tallies;
  } else if (method === METHOD_NUMERIC_RANGE) {
    const values: number[] = [];
    for (const resp of deduplicated) {
      if (resp.numericValue !== undefined) {
        values.push(resp.numericValue);
      }
    }

    if (values.length > 0) {
      const sortedVals = [...values].sort((a, b) => a - b);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const median =
        values.length % 2 === 0
          ? (sortedVals[values.length / 2 - 1] + sortedVals[values.length / 2]) / 2
          : sortedVals[Math.floor(values.length / 2)];

      // Create histogram bins
      const nc = survey.numericConstraints!;
      const range = nc.maxValue - nc.minValue;
      const binCount = Math.min(10, range + 1);
      const binSize = range / binCount;
      const bins: { range: string; count: number }[] = [];

      for (let i = 0; i < binCount; i++) {
        const lo = nc.minValue + i * binSize;
        const hi = i === binCount - 1 ? nc.maxValue : nc.minValue + (i + 1) * binSize;
        const label = `${Math.round(lo)}-${Math.round(hi)}`;
        const count = values.filter((v) => {
          if (i === binCount - 1) return v >= lo && v <= hi;
          return v >= lo && v < hi;
        }).length;
        bins.push({ range: label, count });
      }

      numericTally = {
        values,
        mean,
        median,
        min: sortedVals[0],
        max: sortedVals[sortedVals.length - 1],
        bins,
      };
    } else {
      numericTally = {
        values: [],
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        bins: [],
      };
    }
  }

  // Compute total weight across all deduplicated voters
  let totalWeight = 0;
  if (weighting === 'StakeBased' && stakeMap) {
    for (const resp of deduplicated) {
      const lovelace = stakeMap.get(resp.responseCredential);
      totalWeight += lovelace ? Number(lovelace) / 1_000_000 : 0;
    }
  } else {
    totalWeight = deduplicated.length; // 1 per credential
  }

  return {
    surveyTxId: responses[0]?.surveyTxId ?? '',
    totalResponses: responses.length,
    uniqueCredentials: deduplicated.length,
    weighting,
    totalWeight,
    optionTallies,
    numericTally,
  };
}
