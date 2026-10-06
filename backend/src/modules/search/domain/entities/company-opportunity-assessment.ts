import type { DataQualityReport } from './company-intelligence.js';
import type { GapEvidenceReference } from './company-gap-analysis.js';

/**
 * R6 Opportunity Assessment — pure derived types.
 *
 * Four concepts are kept explicitly separate and must never be collapsed:
 *
 *   1. demonstrated digital maturity — positively demonstrated capability only
 *   2. evidence coverage / maturity confidence — how much evidence was evaluable
 *   3. R4 data quality — referenced verbatim, never re-derived here
 *   4. commercial opportunity — NOT a function of (1) or (2)
 *
 * Commercial opportunity is UNDETERMINED for every admissible R6 v1 input,
 * because no admissible proven-gap evidence exists while R5 leaves MISSING
 * unreachable. Maturity and coverage are never inputs to the opportunity
 * builder; see buildOpportunitySignal in the service.
 */
export const R6_ENGINE_VERSION = 1;

export const ScoreGroup = {
  FOUNDATION: 'G_FOUNDATION',
  CAPABILITIES: 'G_CAPABILITIES',
  SOCIAL: 'G_SOCIAL',
} as const;

export type ScoreGroup = (typeof ScoreGroup)[keyof typeof ScoreGroup];

export const ConfidenceBand = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
} as const;

export type ConfidenceBand = (typeof ConfidenceBand)[keyof typeof ConfidenceBand];

export const MaturityReasonCode = {
  DEMONSTRATED: 'DEMONSTRATED',
  PARTIALLY_DEMONSTRATED: 'PARTIALLY_DEMONSTRATED',
  NOT_DEMONSTRATED: 'NOT_DEMONSTRATED',
  NOT_EVALUATED: 'NOT_EVALUATED',
} as const;

export type MaturityReasonCode = (typeof MaturityReasonCode)[keyof typeof MaturityReasonCode];

export const OpportunityState = {
  UNDETERMINED: 'UNDETERMINED',
  DETERMINED: 'DETERMINED',
} as const;

export type OpportunityState = (typeof OpportunityState)[keyof typeof OpportunityState];

export const OpportunityReasonCode = {
  INSUFFICIENT_PROVEN_GAPS: 'INSUFFICIENT_PROVEN_GAPS',
} as const;

export type OpportunityReasonCode = (typeof OpportunityReasonCode)[keyof typeof OpportunityReasonCode];

/**
 * One scoreable evidence group. `unitCount` is the number of independent
 * demonstration units inside the group; `satisfiedUnits` counts the units
 * that are positively demonstrated.
 */
export interface MaturityComponent {
  group: ScoreGroup;
  weight: number;
  unitCount: number;
  satisfiedUnits: number;
  evaluated: boolean;
  reasonCode: MaturityReasonCode;
  reason: string;
  evidence: GapEvidenceReference[];
}

export interface DemonstratedMaturity {
  score: number;
  numerator: number;
  denominator: number;
  components: MaturityComponent[];
}

export interface CoverageGroup {
  group: ScoreGroup;
  weight: number;
  evaluated: boolean;
}

export interface EvidenceCoverage {
  value: number;
  numerator: number;
  denominator: number;
  confidenceBand: ConfidenceBand;
  evaluatedGroups: ScoreGroup[];
}

/**
 * Commercial opportunity signal. Deliberately state-based, never numeric, and
 * never banded. `provenGapCount` is the literal 0 in v1: no admissible proven
 * gap exists, so widening this type requires proven-gap evidence to exist.
 */
export interface OpportunitySignal {
  state: OpportunityState;
  reasonCode: OpportunityReasonCode;
  reason: string;
  provenGapCount: 0;
}

/**
 * Unweighted, read-only pass-through of provider commercial signals. These
 * fields are never inputs to maturity, coverage, confidence, or opportunity.
 */
export interface BusinessContext {
  ratings: number[];
  ratingCounts: number[];
  categories: string[];
  areas: string[];
  verificationStatuses: string[];
}

export interface CompanyOpportunityAssessment {
  companyId: string;
  companyName: string;
  computedAt: string;
  engineVersion: number;
  maturity: DemonstratedMaturity;
  coverage: EvidenceCoverage;
  quality: DataQualityReport;
  opportunity: OpportunitySignal;
  businessContext: BusinessContext;
}
