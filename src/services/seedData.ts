/**
 * Seed data for the simulated blockchain.
 * Pre-populates realistic Cardano governance surveys with responses
 * so the app feels alive on first load.
 */
import type { SurveyDetails } from '../types/survey.ts';
import {
  METHOD_SINGLE_CHOICE,
  METHOD_MULTI_SELECT,
  METHOD_NUMERIC_RANGE,
} from '../types/survey.ts';

export interface SeedSurvey {
  details: SurveyDetails;
  msg: string[];
  responses: SeedResponse[];
}

export interface SeedResponse {
  selection?: number[];
  numericValue?: number;
}

export const SEED_SURVEYS: SeedSurvey[] = [
  // ─── Survey 1: Multi-select (the CIP example) ────────────────────
  {
    details: {
      specVersion: '1.0.0',
      title: 'Dijkstra Hard-Fork CIP Shortlist',
      description:
        'Select any number of candidate CIPs for potential inclusion in the Dijkstra hard fork. This survey helps gauge community sentiment on which proposals should be prioritized.',
      question:
        'Which CIPs should be shortlisted for potential inclusion in Dijkstra?',
      methodType: METHOD_MULTI_SELECT,
      options: ['CIP-0108', 'CIP-0119', 'CIP-0136', 'CIP-0149'],
      maxSelections: 4,
      eligibility: ['Stakeholder'],
      voteWeighting: 'CredentialBased',
      lifecycle: {
        startSlot: 120_000_000,
        endSlot: 120_432_000,
      },
    },
    msg: ['Dijkstra Hard-Fork CIP Shortlist'],
    responses: [
      { selection: [0, 2] },
      { selection: [0, 1, 3] },
      { selection: [2, 3] },
      { selection: [0] },
      { selection: [1, 2] },
      { selection: [0, 2, 3] },
      { selection: [0, 1] },
      { selection: [2] },
      { selection: [0, 3] },
      { selection: [1, 2, 3] },
      { selection: [0, 2] },
      { selection: [0, 1, 2] },
      { selection: [3] },
      { selection: [0, 2] },
      { selection: [1] },
      { selection: [0, 1, 2, 3] },
      { selection: [2, 3] },
      { selection: [0] },
      { selection: [0, 2, 3] },
      { selection: [1, 3] },
      { selection: [0, 2] },
      { selection: [0, 1, 3] },
      { selection: [2] },
      { selection: [0, 3] },
    ],
  },

  // ─── Survey 2: Single-choice governance ───────────────────────────
  {
    details: {
      specVersion: '1.0.0',
      title: 'Treasury Withdrawal Approval',
      description:
        'Community sentiment poll on the proposed 5M ADA treasury withdrawal for developer tooling grants as outlined in the Q1 2025 budget proposal.',
      question:
        'Do you support the 5M ADA treasury withdrawal for developer tooling grants?',
      methodType: METHOD_SINGLE_CHOICE,
      options: ['Yes', 'No', 'Abstain'],
      eligibility: ['DRep', 'SPO'],
      voteWeighting: 'StakeBased',
      lifecycle: {
        startSlot: 119_500_000,
        endSlot: 120_200_000,
      },
    },
    msg: ['Treasury Withdrawal Approval'],
    responses: [
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [2] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [2] },
      { selection: [0] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [2] },
      { selection: [0] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [0] },
      { selection: [2] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [0] },
    ],
  },

  // ─── Survey 3: Numeric-range parameter poll ───────────────────────
  {
    details: {
      specVersion: '1.0.0',
      title: 'Min Pool Cost Parameter',
      description:
        'Gathering community preferences for the optimal minimum fixed pool cost (minPoolCost) parameter value. The current value is 170 ADA.',
      question:
        'What should the minPoolCost parameter be set to (in ADA)?',
      methodType: METHOD_NUMERIC_RANGE,
      numericConstraints: {
        minValue: 0,
        maxValue: 500,
        step: 10,
      },
      eligibility: ['SPO', 'DRep'],
      voteWeighting: 'CredentialBased',
    },
    msg: ['Min Pool Cost Parameter'],
    responses: [
      { numericValue: 170 },
      { numericValue: 100 },
      { numericValue: 50 },
      { numericValue: 170 },
      { numericValue: 200 },
      { numericValue: 0 },
      { numericValue: 100 },
      { numericValue: 170 },
      { numericValue: 50 },
      { numericValue: 340 },
      { numericValue: 170 },
      { numericValue: 100 },
      { numericValue: 0 },
      { numericValue: 170 },
      { numericValue: 80 },
      { numericValue: 170 },
      { numericValue: 250 },
      { numericValue: 100 },
      { numericValue: 170 },
      { numericValue: 50 },
    ],
  },

  // ─── Survey 4: Single-choice community ────────────────────────────
  {
    details: {
      specVersion: '1.0.0',
      title: 'Cardano Summit 2025 Location',
      description:
        'Help the community choose the host city for the annual Cardano Summit. All four cities have submitted formal bids.',
      question: 'Which city should host the Cardano Summit 2025?',
      methodType: METHOD_SINGLE_CHOICE,
      options: ['Tokyo', 'Dubai', 'Buenos Aires', 'Nairobi'],
      eligibility: ['Stakeholder'],
      voteWeighting: 'CredentialBased',
    },
    msg: ['Cardano Summit 2025 Location'],
    responses: [
      { selection: [0] },
      { selection: [2] },
      { selection: [0] },
      { selection: [1] },
      { selection: [3] },
      { selection: [0] },
      { selection: [0] },
      { selection: [2] },
      { selection: [1] },
      { selection: [3] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [2] },
      { selection: [3] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
      { selection: [3] },
      { selection: [2] },
      { selection: [0] },
      { selection: [0] },
      { selection: [1] },
      { selection: [3] },
      { selection: [2] },
      { selection: [0] },
      { selection: [1] },
      { selection: [0] },
    ],
  },

  // ─── Survey 5: Multi-select ecosystem ─────────────────────────────
  {
    details: {
      specVersion: '1.0.0',
      title: 'DApp Ecosystem Priorities',
      description:
        'Help identify which ecosystem verticals should receive the most focus and funding support in the upcoming Catalyst round.',
      question:
        'Which DApp verticals should be prioritized for Catalyst funding?',
      methodType: METHOD_MULTI_SELECT,
      options: [
        'DeFi / DEX',
        'Identity & DIDs',
        'Gaming & NFTs',
        'RealFi / Lending',
        'Developer Tooling',
        'Education & Onboarding',
      ],
      maxSelections: 3,
      eligibility: ['Stakeholder', 'DRep'],
      voteWeighting: 'CredentialBased',
    },
    msg: ['DApp Ecosystem Priorities'],
    responses: [
      { selection: [0, 4, 5] },
      { selection: [1, 3] },
      { selection: [0, 2, 4] },
      { selection: [4, 5] },
      { selection: [0, 1, 3] },
      { selection: [2, 4] },
      { selection: [0, 5] },
      { selection: [1, 4, 5] },
      { selection: [0, 3, 4] },
      { selection: [3, 5] },
      { selection: [0, 4] },
      { selection: [1, 2, 5] },
      { selection: [0, 4, 5] },
      { selection: [0, 1] },
      { selection: [2, 3, 4] },
      { selection: [4, 5] },
      { selection: [0, 2] },
      { selection: [0, 4, 5] },
    ],
  },
];
