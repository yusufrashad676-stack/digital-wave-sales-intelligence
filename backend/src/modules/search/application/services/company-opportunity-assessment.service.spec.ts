import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  DataQualityReport,
  WebsiteCapabilityObservation,
} from '../../domain/entities/company-intelligence.js';
import {
  CompanyGapAnalysis,
  GapDimension,
  GapEvidenceReference,
  GapState,
} from '../../domain/entities/company-gap-analysis.js';
import {
  ConfidenceBand,
  MaturityReasonCode,
  OpportunityReasonCode,
  OpportunityState,
  R6_ENGINE_VERSION,
  ScoreGroup,
} from '../../domain/entities/company-opportunity-assessment.js';
import { CompanyGapAnalysisService } from '../services/company-gap-analysis.service.js';
import { CompanyIntelligenceService } from '../services/company-intelligence.service.js';
import { CompanyOpportunityAssessmentService } from './company-opportunity-assessment.service.js';

const COMPANY_ID = 'company-1';
const COMPANY_NAME = 'Acme Corp';
const NOW = new Date('2026-06-15T12:00:00.000Z');
const FETCHED_AT = '2026-05-01T00:00:00.000Z';

const gapService = new CompanyGapAnalysisService();
const intelligenceService = new CompanyIntelligenceService();
const service = new CompanyOpportunityAssessmentService();

function baseBundle(): CompanyEvidenceBundle {
  return {
    companyId: COMPANY_ID,
    companyName: COMPANY_NAME,
    websites: [],
    phones: [],
    emails: [],
    socialProfiles: [],
    locations: [],
    observations: [],
  };
}

function observation(overrides: Partial<WebsiteCapabilityObservation> = {}): CompanyObservationInput {
  return {
    retrievedAt: FETCHED_AT,
    sourceUrl: 'https://maps.example/place/acme',
    websiteDomain: 'acme.example',
    latitude: null,
    longitude: null,
    formattedAddress: null,
    websiteCheckSucceeded: true,
    websiteCheckFailed: false,
    websiteFetchedAt: FETCHED_AT,
    socialChecks: [],
    websiteCapabilities: {
      provider: 'http-website-enrichment',
      fetchedAt: FETCHED_AT,
      reachable: true,
      https: true,
      contactPageUrl: null,
      hasContactForm: false,
      bookingPageUrl: null,
      whatsappUrl: null,
      ...overrides,
    },
  };
}

function addWebsite(bundle: CompanyEvidenceBundle): void {
  bundle.websites.push({
    domain: 'acme.example',
    url: 'https://acme.example',
    evidenceSource: 'http-website-enrichment',
    evidenceUrl: 'https://acme.example',
    observedAt: FETCHED_AT,
  });
}

function addSocial(bundle: CompanyEvidenceBundle): void {
  bundle.socialProfiles.push({
    platform: 'instagram',
    handle: 'acme',
    profileUrl: 'https://instagram.com/acme',
    evidenceSource: 'http-social-discovery',
    evidenceUrl: 'https://instagram.com/acme',
    observedAt: FETCHED_AT,
  });
}

function realGaps(bundle: CompanyEvidenceBundle): CompanyGapAnalysis {
  return gapService.build(bundle, NOW);
}

function realQuality(bundle: CompanyEvidenceBundle): DataQualityReport {
  return intelligenceService.build(bundle, NOW).quality;
}

function syntheticGaps(states: Partial<Record<GapDimension, GapState>>): CompanyGapAnalysis {
  return {
    companyId: COMPANY_ID,
    companyName: COMPANY_NAME,
    computedAt: NOW.toISOString(),
    gaps: [
      GapDimension.WEBSITE,
      GapDimension.BOOKING,
      GapDimension.CONTACT_CAPTURE,
      GapDimension.SOCIAL_PRESENCE,
      GapDimension.WHATSAPP,
      GapDimension.ONLINE_PRESENCE,
      GapDimension.BASIC_DIGITAL_FOUNDATION,
      GapDimension.CRM_SYSTEM,
      GapDimension.AUTOMATION,
      GapDimension.AI_USAGE,
    ].map((dimension) => ({
      dimension,
      state: states[dimension] ?? GapState.UNKNOWN,
      reasonCode: 'NO_EVIDENCE_OBSERVED' as never,
      reason: 'synthetic',
      evidence: [],
    })),
  };
}

const ALL_PRESENT = syntheticGaps(
  Object.fromEntries(
    [
      GapDimension.WEBSITE,
      GapDimension.BOOKING,
      GapDimension.CONTACT_CAPTURE,
      GapDimension.SOCIAL_PRESENCE,
      GapDimension.WHATSAPP,
    ].map((dimension) => [dimension, GapState.PRESENT]),
  ) as Partial<Record<GapDimension, GapState>>,
);

const ALL_UNKNOWN = syntheticGaps({});

function gapWithEvidence(): GapEvidenceReference {
  return {
    source: 'search-result-enrichment',
    field: 'website.bookingPageUrl',
    provider: 'http-website-enrichment',
    url: 'https://acme.example/book',
    observedAt: FETCHED_AT,
  };
}

describe('CompanyOpportunityAssessmentService — opportunity invariance', () => {
  const empties = baseBundle();
  const full = baseBundle();
  addWebsite(full);
  addSocial(full);
  full.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));

  const bundles: Array<[string, CompanyEvidenceBundle]> = [
    ['no evidence', empties],
    ['full evidence', full],
  ];
  const gapSets: Array<[string, CompanyGapAnalysis]> = [
    ['all unknown', ALL_UNKNOWN],
    ['all present', ALL_PRESENT],
  ];

  for (const [bundleLabel, bundle] of bundles) {
    for (const [gapLabel, gaps] of gapSets) {
      it(`A: opportunity is UNDETERMINED for ${bundleLabel} / ${gapLabel}`, () => {
        const result = service.build(bundle, gaps, realQuality(bundle), NOW);
        assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
        assert.equal(result.opportunity.reasonCode, OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS);
        assert.equal(result.opportunity.provenGapCount, 0);
      });
    }
  }

  it('A5: maturity and coverage extremes never change the opportunity state', () => {
    const combos = [
      { maturity: 0, coverage: 0 },
      { maturity: 0, coverage: 100 },
      { maturity: 100, coverage: 0 },
      { maturity: 100, coverage: 100 },
    ];
    const seen = new Set<number>();
    for (const combo of combos) {
      const bundle = baseBundle();
      if (combo.coverage > 0) {
        addWebsite(bundle);
        addSocial(bundle);
        bundle.observations.push(observation());
      }
      const gaps = combo.maturity > 0 ? ALL_PRESENT : ALL_UNKNOWN;
      const result = service.build(bundle, gaps, realQuality(bundle), NOW);
      seen.add(result.maturity.score);
      assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
      assert.equal(result.opportunity.reasonCode, OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS);
    }
    assert.ok(seen.size >= 2, 'test should exercise more than one maturity value');
  });

  it('A7: response carries no opportunity band, numeric score, rank, or percentile', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.deepEqual(Object.keys(result).sort(), [
      'businessContext',
      'companyId',
      'companyName',
      'computedAt',
      'coverage',
      'engineVersion',
      'maturity',
      'opportunity',
      'quality',
    ]);
    assert.deepEqual(Object.keys(result.opportunity).sort(), ['provenGapCount', 'reason', 'reasonCode', 'state']);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['"band"', 'percentile', 'priority', 'rank']) {
      assert.ok(!serialized.includes(forbidden), `must not contain ${forbidden}`);
    }
  });

  it('A6: provenGapCount is 0 in every v1 output', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(observation());
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.opportunity.provenGapCount, 0);
  });

  it('A8: opportunity reason is a stable, human-readable statement', () => {
    const result = service.build(baseBundle(), ALL_UNKNOWN, realQuality(baseBundle()), NOW);
    assert.equal(typeof result.opportunity.reason, 'string');
    assert.ok(result.opportunity.reason.length > 0);
  });
});

describe('CompanyOpportunityAssessmentService — maturity arithmetic', () => {
  it('B1: all groups demonstrated scores 100', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(
      observation({
        bookingPageUrl: 'https://acme.example/book',
        hasContactForm: true,
        whatsappUrl: 'https://wa.me/1',
      }),
    );
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.maturity.score, 100);
    assert.equal(result.maturity.numerator, result.maturity.denominator);
  });

  it('B2: nothing demonstrated scores 0', () => {
    const bundle = baseBundle();
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.maturity.score, 0);
    assert.equal(result.maturity.numerator, 0);
  });

  it('B3: foundation alone scores exactly its weight contribution', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.maturity.score, 30);
  });

  it('B3b: social alone scores 20', () => {
    const bundle = baseBundle();
    addSocial(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.maturity.score, 20);
  });

  it('B3c: capability units score 17 / 33 / 50 for k = 1 / 2 / 3', () => {
    const cases: Array<[number, number]> = [
      [1, 17],
      [2, 33],
      [3, 50],
    ];
    for (const [k, expected] of cases) {
      const states: Partial<Record<GapDimension, GapState>> = {};
      if (k >= 1) states[GapDimension.BOOKING] = GapState.PRESENT;
      if (k >= 2) states[GapDimension.CONTACT_CAPTURE] = GapState.PRESENT;
      if (k >= 3) states[GapDimension.WHATSAPP] = GapState.PRESENT;
      const result = service.build(baseBundle(), syntheticGaps(states), realQuality(baseBundle()), NOW);
      assert.equal(result.maturity.score, expected, `k=${k}`);
      assert.equal(result.maturity.denominator, 300, `k=${k}`);
    }
  });

  it('B4: rounding boundaries are exact integers', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(Number.isInteger(result.maturity.score), true);
    assert.equal(result.maturity.score, Math.round((100 * result.maturity.numerator) / result.maturity.denominator));
  });

  it('B5: fixed denominator regardless of coverage', () => {
    const covered = baseBundle();
    addWebsite(covered);
    addSocial(covered);
    covered.observations.push(observation());

    const uncovered = baseBundle();

    const a = service.build(covered, realGaps(covered), realQuality(covered), NOW);
    const b = service.build(uncovered, realGaps(uncovered), realQuality(uncovered), NOW);
    assert.equal(a.maturity.denominator, b.maturity.denominator);
    assert.equal(a.maturity.denominator, 300);
  });
});

describe('CompanyOpportunityAssessmentService — state treatment', () => {
  function component(score: ReturnType<typeof service.build>, group: ScoreGroup) {
    const found = score.maturity.components.find((entry) => entry.group === group);
    assert.ok(found, `expected component ${group}`);
    return found;
  }

  it('C1: PRESENT contributes satisfied units', () => {
    const gaps = syntheticGaps({
      [GapDimension.WEBSITE]: GapState.PRESENT,
      [GapDimension.BOOKING]: GapState.PRESENT,
    });
    const result = service.build(baseBundle(), gaps, realQuality(baseBundle()), NOW);
    assert.equal(component(result, ScoreGroup.FOUNDATION).satisfiedUnits, 1);
    assert.equal(component(result, ScoreGroup.CAPABILITIES).satisfiedUnits, 1);
    assert.equal(component(result, ScoreGroup.CAPABILITIES).unitCount, 3);
  });

  it('C2: UNKNOWN never satisfies and never raises coverage', () => {
    const bundle = baseBundle();
    const result = service.build(bundle, ALL_UNKNOWN, realQuality(bundle), NOW);
    for (const entry of result.maturity.components) {
      assert.equal(entry.satisfiedUnits, 0);
      assert.equal(entry.evaluated, false);
    }
    assert.equal(result.coverage.value, 0);
    assert.equal(result.coverage.confidenceBand, ConfidenceBand.INSUFFICIENT_EVIDENCE);
  });

  it('C3: MISSING would not satisfy, and is unreachable in v1', () => {
    const gaps = syntheticGaps({
      [GapDimension.WEBSITE]: GapState.PRESENT,
      [GapDimension.BOOKING]: GapState.MISSING,
    });
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, gaps, realQuality(bundle), NOW);
    assert.equal(component(result, ScoreGroup.CAPABILITIES).satisfiedUnits, 0);
    assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
    assert.equal(result.opportunity.provenGapCount, 0);
  });

  it('C4: NOT_APPLICABLE never satisfies and does not rescale the fixed denominator', () => {
    const gaps = syntheticGaps({ [GapDimension.WEBSITE]: GapState.NOT_APPLICABLE });
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, gaps, realQuality(bundle), NOW);
    assert.equal(result.maturity.denominator, 300);
    assert.equal(component(result, ScoreGroup.FOUNDATION).satisfiedUnits, 0);
    assert.equal(
      component(result, ScoreGroup.FOUNDATION).reasonCode,
      MaturityReasonCode.NOT_DEMONSTRATED,
      'the contract has no NOT_APPLICABLE reason code',
    );
    assert.equal(result.maturity.score, 0);
  });

  it('C5: R4 CONFLICTED dimensions sit only in quality and never move maturity', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const quality = { ...realQuality(bundle), consistency: { conflicting: 5, dimensions: [], details: [] } };
    const result = service.build(bundle, realGaps(bundle), quality, NOW);
    assert.equal(result.quality.consistency.conflicting, 5);
    assert.equal(result.maturity.score, 30);
    assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
  });

  it('C6: FAILED observations contribute no maturity', () => {
    const bundle = baseBundle();
    const failed = observation({ fetchedAt: null });
    failed.websiteCheckSucceeded = false;
    failed.websiteCheckFailed = true;
    failed.websiteFetchedAt = null;
    bundle.observations.push(failed);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.maturity.score, 0);
    assert.equal(result.coverage.value, 0);
  });
});

describe('CompanyOpportunityAssessmentService — coverage and confidence', () => {
  it('D1: full coverage yields HIGH and still yields UNDETERMINED opportunity', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(observation());
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.equal(result.coverage.value, 100);
    assert.equal(result.coverage.confidenceBand, ConfidenceBand.HIGH);
    assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
  });

  it('D1b: threshold bands are exact', () => {
    const foundationOnly = baseBundle();
    addWebsite(foundationOnly);
    const low = service.build(foundationOnly, realGaps(foundationOnly), realQuality(foundationOnly), NOW);
    assert.equal(low.coverage.value, 30);
    assert.equal(low.coverage.confidenceBand, ConfidenceBand.LOW);

    const foundationSocial = baseBundle();
    addWebsite(foundationSocial);
    addSocial(foundationSocial);
    const medium = service.build(foundationSocial, realGaps(foundationSocial), realQuality(foundationSocial), NOW);
    assert.equal(medium.coverage.value, 50);
    assert.equal(medium.coverage.confidenceBand, ConfidenceBand.MEDIUM);

    const none = baseBundle();
    const noneResult = service.build(none, realGaps(none), realQuality(none), NOW);
    assert.equal(noneResult.coverage.value, 0);
    assert.equal(noneResult.coverage.confidenceBand, ConfidenceBand.INSUFFICIENT_EVIDENCE);
  });

  it('D2: INSUFFICIENT_EVIDENCE marks maturity unreliable but never changes opportunity', () => {
    const bundle = baseBundle();
    const result = service.build(bundle, ALL_UNKNOWN, realQuality(bundle), NOW);
    assert.equal(result.coverage.confidenceBand, ConfidenceBand.INSUFFICIENT_EVIDENCE);
    assert.equal(result.opportunity.state, OpportunityState.UNDETERMINED);
    assert.equal(result.opportunity.reasonCode, OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS);
  });

  it('D3: zero observations never divide by zero', () => {
    const result = service.build(baseBundle(), ALL_UNKNOWN, realQuality(baseBundle()), NOW);
    assert.equal(result.coverage.value, 0);
    assert.equal(result.coverage.numerator, 0);
    assert.equal(result.coverage.denominator, 100);
    assert.equal(Number.isFinite(result.maturity.score), true);
  });

  it('D4: coverage and confidence are clock-independent', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const early = service.build(bundle, realGaps(bundle), realQuality(bundle), new Date('2020-01-01T00:00:00.000Z'));
    const late = service.build(bundle, realGaps(bundle), realQuality(bundle), new Date('2030-01-01T00:00:00.000Z'));
    assert.notEqual(early.computedAt, late.computedAt);
    assert.deepEqual(late.coverage, early.coverage);
    assert.deepEqual(late.maturity, early.maturity);
  });

  it('D5: confidence is not consumed by opportunity', () => {
    const bundle = baseBundle();
    const result = service.build(bundle, ALL_UNKNOWN, realQuality(bundle), NOW);
    assert.equal(Object.keys(result.opportunity).includes('confidenceBand'), false);
    assert.equal(Object.keys(result.opportunity).includes('coverage'), false);
    assert.equal(Object.keys(result.opportunity).includes('maturity'), false);
  });
});

describe('CompanyOpportunityAssessmentService — anti-double-counting', () => {
  it('E1: aggregate R5 dimensions never appear as components', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    const groups = result.maturity.components.map((entry) => entry.group);
    assert.deepEqual(groups, [ScoreGroup.FOUNDATION, ScoreGroup.CAPABILITIES, ScoreGroup.SOCIAL]);
    assert.equal(groups.length, 3);
    assert.equal(groups.includes('ONLINE_PRESENCE' as never), false);
    assert.equal(groups.includes('BASIC_DIGITAL_FOUNDATION' as never), false);
  });

  it('E2: declared weights sum to the total weight', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    const total = result.maturity.components.reduce((sum, entry) => sum + entry.weight, 0);
    assert.equal(total, 100);
    assert.equal(result.coverage.denominator, total);
  });

  it('E3: capability partial credit is k/3', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    bundle.observations.push(observation({ hasContactForm: true }));
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    const component = result.maturity.components.find((entry) => entry.group === ScoreGroup.CAPABILITIES);
    assert.ok(component);
    assert.equal(component.unitCount, 3);
    assert.equal(component.satisfiedUnits, 1);
  });

  it('E4: capability coverage is atomic — all or nothing', () => {
    const oneSignal = baseBundle();
    oneSignal.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));

    const noSignal = baseBundle();
    noSignal.observations.push({ ...observation(), websiteCapabilities: null });

    const a = service.build(oneSignal, realGaps(oneSignal), realQuality(oneSignal), NOW);
    const b = service.build(noSignal, realGaps(noSignal), realQuality(noSignal), NOW);

    const capabilities = a.maturity.components.find((entry) => entry.group === ScoreGroup.CAPABILITIES);
    assert.ok(capabilities);
    assert.equal(capabilities.evaluated, true);
    assert.equal(b.coverage.value, 0, 'no page observation means the capability group is not evaluable');
  });
});

describe('CompanyOpportunityAssessmentService — commercial signals', () => {
  function contextualBundle(): CompanyEvidenceBundle {
    const bundle = baseBundle();
    const entry = observation();
    entry.commercial = {
      rating: 4.6,
      ratingCount: 128,
      category: 'clinic',
      area: 'New Cairo',
      verificationStatus: 'UNKNOWN',
    };
    bundle.observations.push(entry);
    return bundle;
  }

  it('F1/F2: a high rating changes no computed figure', () => {
    const bundle = contextualBundle();
    const gaps = realGaps(bundle);
    const quality = realQuality(bundle);

    const scored = service.build(bundle, gaps, quality, NOW);

    for (const rating of [0, 1, 5, null]) {
      const mutated = baseBundle();
      const entry = observation();
      entry.commercial = {
        rating,
        ratingCount: null,
        category: null,
        area: null,
        verificationStatus: null,
      };
      mutated.observations.push(entry);
      const result = service.build(mutated, gaps, quality, NOW);
      assert.equal(result.maturity.score, scored.maturity.score);
      assert.equal(result.coverage.value, scored.coverage.value);
      assert.equal(result.opportunity.state, scored.opportunity.state);
    }
  });

  it('F3: business signals appear only in businessContext', () => {
    const bundle = contextualBundle();
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.deepEqual(result.businessContext, {
      ratings: [4.6],
      ratingCounts: [128],
      categories: ['clinic'],
      areas: ['New Cairo'],
      verificationStatuses: ['UNKNOWN'],
    });
    assert.ok(!JSON.stringify(result.maturity).includes('4.6'));
    assert.ok(!JSON.stringify(result.coverage).includes('4.6'));
    assert.ok(!JSON.stringify(result.opportunity).includes('4.6'));
  });

  it('F3b: business context is deduped and sorted deterministically', () => {
    const bundle = baseBundle();
    for (const rating of [4.2, 4.6, 4.2]) {
      const entry = observation();
      entry.commercial = {
        rating,
        ratingCount: null,
        category: 'clinic',
        area: null,
        verificationStatus: null,
      };
      bundle.observations.push(entry);
    }
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.deepEqual(result.businessContext.ratings, [4.2, 4.6]);
    assert.deepEqual(result.businessContext.categories, ['clinic']);
  });

  it('F4: no rank, percentile, or priority field exists anywhere', () => {
    const bundle = contextualBundle();
    const serialized = JSON.stringify(service.build(bundle, realGaps(bundle), realQuality(bundle), NOW));
    for (const forbidden of ['percentile', 'priority', 'rank', 'OpportunityBand']) {
      assert.ok(!serialized.includes(forbidden), `must not contain ${forbidden}`);
    }
  });
});

describe('CompanyOpportunityAssessmentService — explainability', () => {
  it('G1: every component carries a reasonCode and reason', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    for (const component of result.maturity.components) {
      assert.ok(Object.values(MaturityReasonCode).includes(component.reasonCode));
      assert.ok(component.reason.trim().length > 0, `${component.group} has no reason`);
    }
  });

  it('G1b: unevaluated components are explicitly labelled NOT_EVALUATED', () => {
    const result = service.build(baseBundle(), ALL_UNKNOWN, realQuality(baseBundle()), NOW);
    for (const component of result.maturity.components) {
      assert.equal(component.reasonCode, MaturityReasonCode.NOT_EVALUATED);
      assert.equal(component.evaluated, false);
    }
  });

  it('G2: inputs reproduce the arithmetic by hand', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);

    const scaled = result.maturity.components.reduce(
      (sum, component) => sum + (component.weight * component.satisfiedUnits * 3) / component.unitCount,
      0,
    );
    assert.equal(result.maturity.numerator, scaled);
    assert.equal(Math.round((100 * result.maturity.numerator) / result.maturity.denominator), result.maturity.score);
    assert.equal(
      result.coverage.numerator,
      result.maturity.components.filter((component) => component.evaluated).reduce((sum, c) => sum + c.weight, 0),
    );
    assert.equal(Math.round((100 * result.coverage.numerator) / result.coverage.denominator), result.coverage.value);
  });

  it('G2b: coverage numerator equals the sum of evaluated weights', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(observation());
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    const evaluatedWeight = result.maturity.components
      .filter((component) => component.evaluated)
      .reduce((sum, component) => sum + component.weight, 0);
    assert.equal(result.coverage.numerator, evaluatedWeight);
    assert.equal(result.coverage.value, evaluatedWeight);
  });

  it('G3: evidence references carry no raw payload', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    for (const component of result.maturity.components) {
      for (const reference of component.evidence) {
        assert.deepEqual(Object.keys(reference).sort(), ['field', 'observedAt', 'provider', 'source', 'url']);
      }
    }
  });

  it('G4: demonstrated evidence is attached to the component that earned it', () => {
    const gaps = syntheticGaps({ [GapDimension.BOOKING]: GapState.PRESENT });
    gaps.gaps[1] = {
      ...gaps.gaps[1],
      evidence: [gapWithEvidence()],
    };
    const bundle = baseBundle();
    const result = service.build(bundle, gaps, realQuality(bundle), NOW);
    const component = result.maturity.components.find((entry) => entry.group === ScoreGroup.CAPABILITIES);
    assert.ok(component);
    assert.equal(component.evidence.length, 1);
    assert.equal(component.evidence[0].url, 'https://acme.example/book');
  });

  it('G5: engineVersion is present and stable', () => {
    const result = service.build(baseBundle(), ALL_UNKNOWN, realQuality(baseBundle()), NOW);
    assert.equal(result.engineVersion, R6_ENGINE_VERSION);
    assert.equal(result.engineVersion, 1);
  });

  it('G5b: R4 data quality is passed through verbatim as its own concept', () => {
    const bundle = baseBundle();
    addWebsite(bundle);
    const quality = realQuality(bundle);
    const result = service.build(bundle, realGaps(bundle), quality, NOW);
    assert.equal(result.quality, quality);
    assert.deepEqual(Object.keys(result.quality).sort(), [
      'completeness',
      'consistency',
      'freshness',
      'provenance',
      'validity',
    ]);
  });
});

describe('CompanyOpportunityAssessmentService — determinism', () => {
  function richBundle(): CompanyEvidenceBundle {
    const bundle = baseBundle();
    addWebsite(bundle);
    addSocial(bundle);
    bundle.observations.push(
      observation({
        bookingPageUrl: 'https://acme.example/book',
        hasContactForm: true,
        whatsappUrl: 'https://wa.me/1',
      }),
    );
    return bundle;
  }

  it('H1: identical input yields identical output', () => {
    const bundle = richBundle();
    const gaps = realGaps(bundle);
    const quality = realQuality(bundle);
    const first = service.build(bundle, gaps, quality, NOW);
    const second = service.build(bundle, gaps, quality, NOW);
    assert.deepEqual(second, first);
  });

  it('H2: classification does not depend on the clock', () => {
    const bundle = richBundle();
    const gaps = realGaps(bundle);
    const quality = realQuality(bundle);
    const early = service.build(bundle, gaps, quality, new Date('2020-01-01T00:00:00.000Z'));
    const late = service.build(bundle, gaps, quality, new Date('2030-01-01T00:00:00.000Z'));
    assert.notEqual(early.computedAt, late.computedAt);
    assert.equal(late.maturity.score, early.maturity.score);
    assert.equal(late.coverage.value, early.coverage.value);
    assert.deepEqual(late.opportunity, early.opportunity);
    assert.deepEqual(late.businessContext, early.businessContext);
  });

  it('H3: component ordering is stable', () => {
    const bundle = richBundle();
    const result = service.build(bundle, realGaps(bundle), realQuality(bundle), NOW);
    assert.deepEqual(
      result.maturity.components.map((component) => component.group),
      [ScoreGroup.FOUNDATION, ScoreGroup.CAPABILITIES, ScoreGroup.SOCIAL],
    );
    assert.deepEqual(result.coverage.evaluatedGroups, [
      ScoreGroup.FOUNDATION,
      ScoreGroup.CAPABILITIES,
      ScoreGroup.SOCIAL,
    ]);
  });

  it('H4: duplicate evidence is deduped', () => {
    const gaps = syntheticGaps({ [GapDimension.WEBSITE]: GapState.PRESENT });
    const reference = gapWithEvidence();
    gaps.gaps[0] = { ...gaps.gaps[0], evidence: [reference, { ...reference }] };
    const bundle = baseBundle();
    const result = service.build(bundle, gaps, realQuality(bundle), NOW);
    const component = result.maturity.components.find((entry) => entry.group === ScoreGroup.FOUNDATION);
    assert.ok(component);
    assert.equal(component.evidence.length, 1);
  });
});
