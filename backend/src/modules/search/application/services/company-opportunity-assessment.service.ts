import { Injectable } from '@nestjs/common';
import { CompanyEvidenceBundle, CompanyObservationInput } from '../../domain/entities/company-intelligence.js';
import {
  CompanyGapAnalysis,
  GapDimension,
  GapEvidenceReference,
  GapState,
} from '../../domain/entities/company-gap-analysis.js';
import {
  BusinessContext,
  CompanyOpportunityAssessment,
  ConfidenceBand,
  DemonstratedMaturity,
  EvidenceCoverage,
  MaturityComponent,
  MaturityReasonCode,
  OpportunityReasonCode,
  OpportunitySignal,
  OpportunityState,
  R6_ENGINE_VERSION,
  ScoreGroup,
} from '../../domain/entities/company-opportunity-assessment.js';
import type { DataQualityReport } from '../../domain/entities/company-intelligence.js';

const W_FOUNDATION = 30;
const W_CAPABILITIES = 50;
const W_SOCIAL = 20;
const TOTAL_WEIGHT = W_FOUNDATION + W_CAPABILITIES + W_SOCIAL;

const CAPABILITY_UNITS = 3;

const CONFIDENCE_HIGH = 75;
const CONFIDENCE_MEDIUM = 50;
const CONFIDENCE_LOW = 25;

function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

function lcm(left: number, right: number): number {
  return (left * right) / gcd(left, right);
}

function dedupe(references: readonly GapEvidenceReference[]): GapEvidenceReference[] {
  const seen = new Set<string>();
  const result: GapEvidenceReference[] = [];
  for (const reference of references) {
    const key = `${reference.source}|${reference.field}|${reference.provider ?? ''}|${reference.url ?? ''}|${reference.observedAt ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(reference);
  }
  return result;
}

function sortedNumbers(values: ReadonlyArray<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number'))].sort(
    (left, right) => left - right,
  );
}

function sortedStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  const unique = [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value !== ''),
    ),
  ];
  return unique.sort((left, right) => left.localeCompare(right));
}

function hasPageObservation(observation: CompanyObservationInput): boolean {
  return observation.websiteCapabilities !== null && observation.websiteCapabilities !== undefined;
}

function hasFetchedPage(observation: CompanyObservationInput): boolean {
  return hasPageObservation(observation) && observation.websiteCapabilities?.fetchedAt !== null;
}

function hasSocialDiscovery(observation: CompanyObservationInput): boolean {
  return observation.socialChecks.some((check) => {
    const profileUrl = check.profileUrl;
    return typeof profileUrl === 'string' && profileUrl.trim() !== '';
  });
}

function groupEvidence(gap: CompanyGapAnalysis, dimensions: readonly GapDimension[]): GapEvidenceReference[] {
  return dedupe(
    gap.gaps.filter((result) => dimensions.includes(result.dimension)).flatMap((result) => result.evidence),
  );
}

function reasonFor(
  reasonCode: MaturityReasonCode,
  group: ScoreGroup,
  satisfiedUnits: number,
  unitCount: number,
): string {
  switch (reasonCode) {
    case MaturityReasonCode.DEMONSTRATED:
      return `${group}: ${unitCount}/${unitCount} demonstration units positively evidenced.`;
    case MaturityReasonCode.PARTIALLY_DEMONSTRATED:
      return `${group}: ${satisfiedUnits}/${unitCount} demonstration units positively evidenced; remaining units are not demonstrated.`;
    case MaturityReasonCode.NOT_DEMONSTRATED:
      return `${group}: evidence was evaluable but no unit is positively demonstrated; absence is never treated as a proven gap.`;
    case MaturityReasonCode.NOT_EVALUATED:
      return `${group}: no evaluable evidence, so it contributes 0 to maturity and 0 to coverage.`;
  }
}

/**
 * Commercial opportunity is state-based and never derived. The builder takes no
 * arguments, so maturity and coverage are structurally incapable of reaching it.
 */
function buildOpportunitySignal(): OpportunitySignal {
  return {
    state: OpportunityState.UNDETERMINED,
    reasonCode: OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS,
    reason:
      'No admissible proven-gap evidence exists for this company: R5 does not emit MISSING without conclusive absence, so commercial opportunity cannot be determined.',
    provenGapCount: 0,
  };
}

function confidenceBandFor(coverage: number): ConfidenceBand {
  if (coverage >= CONFIDENCE_HIGH) {
    return ConfidenceBand.HIGH;
  }
  if (coverage >= CONFIDENCE_MEDIUM) {
    return ConfidenceBand.MEDIUM;
  }
  if (coverage >= CONFIDENCE_LOW) {
    return ConfidenceBand.LOW;
  }
  return ConfidenceBand.INSUFFICIENT_EVIDENCE;
}

/**
 * R6 Opportunity Assessment.
 *
 * Pure and deterministic: identical inputs always yield identical output. No
 * network access, no AI, no persistence.
 *
 * Epistemic contract:
 * - Maturity counts positively demonstrated capability only.
 * - Coverage counts evaluable evidence only, and never moves a group score.
 * - UNKNOWN is neither a demonstration nor a proven gap.
 * - Commercial opportunity is never derived from maturity or coverage.
 */
@Injectable()
export class CompanyOpportunityAssessmentService {
  build(
    bundle: CompanyEvidenceBundle,
    gaps: CompanyGapAnalysis,
    quality: DataQualityReport,
    now: Date = new Date(),
  ): CompanyOpportunityAssessment {
    const components = [
      this.foundationComponent(gaps, bundle),
      this.capabilitiesComponent(gaps, bundle),
      this.socialComponent(gaps, bundle),
    ];

    const maturity = this.computeMaturity(components);
    const coverage = this.computeCoverage(components);
    const businessContext = this.buildBusinessContext(bundle);

    return {
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      computedAt: now.toISOString(),
      engineVersion: R6_ENGINE_VERSION,
      maturity,
      coverage,
      quality,
      opportunity: buildOpportunitySignal(),
      businessContext,
    };
  }

  private foundationComponent(gaps: CompanyGapAnalysis, bundle: CompanyEvidenceBundle): MaturityComponent {
    const evaluated = bundle.websites.length > 0 || bundle.observations.some(hasFetchedPage);
    const website = gaps.gaps.find((result) => result.dimension === GapDimension.WEBSITE);
    const satisfiedUnits = website?.state === GapState.PRESENT ? 1 : 0;
    const unitCount = 1;
    const reasonCode = this.reasonCodeFor(evaluated, satisfiedUnits, unitCount);

    return {
      group: ScoreGroup.FOUNDATION,
      weight: W_FOUNDATION,
      unitCount,
      satisfiedUnits,
      evaluated,
      reasonCode,
      reason: reasonFor(reasonCode, ScoreGroup.FOUNDATION, satisfiedUnits, unitCount),
      evidence: dedupe(website?.evidence ?? []),
    };
  }

  private capabilitiesComponent(gaps: CompanyGapAnalysis, bundle: CompanyEvidenceBundle): MaturityComponent {
    // Atomic: all three capabilities come from one first-party page observation,
    // so the group is evaluable only when such an observation exists.
    const evaluated = bundle.observations.some(hasFetchedPage);
    const unitCount = CAPABILITY_UNITS;
    const satisfiedUnits = [GapDimension.BOOKING, GapDimension.CONTACT_CAPTURE, GapDimension.WHATSAPP].reduce(
      (count, dimension) =>
        gaps.gaps.find((result) => result.dimension === dimension)?.state === GapState.PRESENT ? count + 1 : count,
      0,
    );
    const reasonCode = this.reasonCodeFor(evaluated, satisfiedUnits, unitCount);

    return {
      group: ScoreGroup.CAPABILITIES,
      weight: W_CAPABILITIES,
      unitCount,
      satisfiedUnits,
      evaluated,
      reasonCode,
      reason: reasonFor(reasonCode, ScoreGroup.CAPABILITIES, satisfiedUnits, unitCount),
      evidence: groupEvidence(gaps, [GapDimension.BOOKING, GapDimension.CONTACT_CAPTURE, GapDimension.WHATSAPP]),
    };
  }

  private socialComponent(gaps: CompanyGapAnalysis, bundle: CompanyEvidenceBundle): MaturityComponent {
    const evaluated = bundle.socialProfiles.length > 0 || bundle.observations.some(hasSocialDiscovery);
    const social = gaps.gaps.find((result) => result.dimension === GapDimension.SOCIAL_PRESENCE);
    const satisfiedUnits = social?.state === GapState.PRESENT ? 1 : 0;
    const unitCount = 1;
    const reasonCode = this.reasonCodeFor(evaluated, satisfiedUnits, unitCount);

    return {
      group: ScoreGroup.SOCIAL,
      weight: W_SOCIAL,
      unitCount,
      satisfiedUnits,
      evaluated,
      reasonCode,
      reason: reasonFor(reasonCode, ScoreGroup.SOCIAL, satisfiedUnits, unitCount),
      evidence: dedupe(social?.evidence ?? []),
    };
  }

  private reasonCodeFor(evaluated: boolean, satisfiedUnits: number, unitCount: number): MaturityReasonCode {
    if (!evaluated) {
      return MaturityReasonCode.NOT_EVALUATED;
    }
    if (satisfiedUnits === unitCount) {
      return MaturityReasonCode.DEMONSTRATED;
    }
    if (satisfiedUnits > 0) {
      return MaturityReasonCode.PARTIALLY_DEMONSTRATED;
    }
    return MaturityReasonCode.NOT_DEMONSTRATED;
  }

  /**
   * Integer arithmetic over a fixed denominator: group contributions are
   * scaled by LCM(unitCount) so partial credit never introduces drift.
   *
   *   scaled = Σ weight_g × satisfied_g × (D / unitCount_g)
   *   score  = round(100 × scaled / (TOTAL_WEIGHT × D))
   */
  private computeMaturity(components: readonly MaturityComponent[]): DemonstratedMaturity {
    const commonUnitFactor = components.reduce((factor, component) => lcm(factor, component.unitCount), 1);
    const denominator = TOTAL_WEIGHT * commonUnitFactor;
    const numerator = components.reduce(
      (sum, component) => sum + component.weight * component.satisfiedUnits * (commonUnitFactor / component.unitCount),
      0,
    );
    const score = Math.round((100 * numerator) / denominator);

    return { score, numerator, denominator, components: [...components] };
  }

  /**
   * Coverage is evaluable weight over total weight. It describes how much was
   * examinable and never alters the maturity score or the opportunity state.
   */
  private computeCoverage(components: readonly MaturityComponent[]): EvidenceCoverage {
    const evaluatedGroups = components.filter((component) => component.evaluated);
    const numerator = evaluatedGroups.reduce((sum, component) => sum + component.weight, 0);
    const denominator = TOTAL_WEIGHT;
    const value = Math.round((100 * numerator) / denominator);

    return {
      value,
      numerator,
      denominator,
      confidenceBand: confidenceBandFor(value),
      evaluatedGroups: evaluatedGroups.map((component) => component.group),
    };
  }

  private buildBusinessContext(bundle: CompanyEvidenceBundle): BusinessContext {
    const commercial = bundle.observations.map((observation) => observation.commercial ?? null);
    return {
      ratings: sortedNumbers(commercial.map((entry) => entry?.rating ?? null)),
      ratingCounts: sortedNumbers(commercial.map((entry) => entry?.ratingCount ?? null)),
      categories: sortedStrings(commercial.map((entry) => entry?.category ?? null)),
      areas: sortedStrings(commercial.map((entry) => entry?.area ?? null)),
      verificationStatuses: sortedStrings(commercial.map((entry) => entry?.verificationStatus ?? null)),
    };
  }
}
