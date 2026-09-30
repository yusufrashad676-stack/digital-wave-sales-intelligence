import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  WebsiteCapabilityObservation,
} from '../../domain/entities/company-intelligence.js';
import {
  CompanyGapAnalysis,
  GapDimension,
  GapReasonCode,
  GapResult,
  GapState,
} from '../../domain/entities/company-gap-analysis.js';
import { CompanyGapAnalysisService } from './company-gap-analysis.service.js';

const COMPANY_ID = 'company-1';
const COMPANY_NAME = 'Acme Corp';
const NOW = new Date('2026-06-15T12:00:00.000Z');
const FETCHED_AT = '2026-05-01T00:00:00.000Z';

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

/**
 * Builds an observation whose website snapshot parsed cleanly and carried no
 * capability signals — the "nothing found on a real page" baseline.
 */
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

function gapOf(analysis: CompanyGapAnalysis, dimension: GapDimension): GapResult {
  const result = analysis.gaps.find((gap) => gap.dimension === dimension);
  assert.ok(result, `expected a result for ${dimension}`);
  return result;
}

describe('CompanyGapAnalysisService', () => {
  const service = new CompanyGapAnalysisService();

  it('A: a canonical website is PRESENT', () => {
    const bundle = baseBundle();
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: FETCHED_AT,
    });
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.WEBSITE).state, GapState.PRESENT);
  });

  it('A2: a completed first-party fetch establishes the website even without a canonical record', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation());
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.WEBSITE).state, GapState.PRESENT);
  });

  it('B: a company with no website evidence is UNKNOWN, never MISSING', () => {
    const gap = gapOf(service.build(baseBundle(), NOW), GapDimension.WEBSITE);
    assert.equal(gap.state, GapState.UNKNOWN);
    assert.equal(gap.reasonCode, GapReasonCode.NO_EVIDENCE_OBSERVED);
  });

  it('C: an observed booking page is PRESENT', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.BOOKING).state, GapState.PRESENT);
  });

  it('D: an unobserved booking capability is UNKNOWN, not MISSING', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation());
    const gap = gapOf(service.build(bundle, NOW), GapDimension.BOOKING);
    assert.equal(gap.state, GapState.UNKNOWN);
    assert.equal(gap.reasonCode, GapReasonCode.ABSENCE_NOT_ADMISSIBLE);
  });

  it('D2: a non-OK response persisting empty defaults does not become a proven gap', () => {
    const bundle = baseBundle();
    bundle.observations.push({
      ...observation(),
      websiteCheckSucceeded: false,
      websiteFetchedAt: null,
      websiteCapabilities: {
        provider: 'http-website-enrichment',
        fetchedAt: FETCHED_AT,
        reachable: true,
        https: true,
        contactPageUrl: null,
        hasContactForm: false,
        bookingPageUrl: null,
        whatsappUrl: null,
      },
    });
    const analysis = service.build(bundle, NOW);
    assert.equal(gapOf(analysis, GapDimension.BOOKING).state, GapState.UNKNOWN);
    assert.equal(gapOf(analysis, GapDimension.CONTACT_CAPTURE).state, GapState.UNKNOWN);
    assert.equal(gapOf(analysis, GapDimension.WHATSAPP).state, GapState.UNKNOWN);
  });

  it('E: a detected contact form is PRESENT', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ hasContactForm: true }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.CONTACT_CAPTURE).state, GapState.PRESENT);
  });

  it('E2: an observed contact page also establishes contact capture', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ contactPageUrl: 'https://acme.example/contact' }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.CONTACT_CAPTURE).state, GapState.PRESENT);
  });

  it('F: no contact form and no contact page is UNKNOWN', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation());
    const gap = gapOf(service.build(bundle, NOW), GapDimension.CONTACT_CAPTURE);
    assert.equal(gap.state, GapState.UNKNOWN);
    assert.equal(gap.reasonCode, GapReasonCode.ABSENCE_NOT_ADMISSIBLE);
  });

  it('G: an observed WhatsApp link is PRESENT', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ whatsappUrl: 'https://wa.me/15550100' }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.WHATSAPP).state, GapState.PRESENT);
  });

  it('H: no observed WhatsApp link is UNKNOWN', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation());
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.WHATSAPP).state, GapState.UNKNOWN);
  });

  it('I: a canonical social profile is PRESENT', () => {
    const bundle = baseBundle();
    bundle.socialProfiles.push({
      platform: 'instagram',
      handle: 'acme',
      profileUrl: 'https://instagram.com/acme',
      evidenceSource: 'http-social-discovery',
      evidenceUrl: 'https://instagram.com/acme',
      observedAt: FETCHED_AT,
    });
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.SOCIAL_PRESENCE).state, GapState.PRESENT);
  });

  it('I2: a discovered social profile in an observation is PRESENT', () => {
    const bundle = baseBundle();
    const withSocial = observation();
    withSocial.socialChecks = [{ platform: 'instagram', profileUrl: 'https://instagram.com/acme', verified: true }];
    bundle.observations.push(withSocial);
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.SOCIAL_PRESENCE).state, GapState.PRESENT);
  });

  it('J: a failed social discovery is UNKNOWN, never MISSING', () => {
    const bundle = baseBundle();
    const failed = observation();
    failed.websiteCheckFailed = true;
    failed.socialChecks = [{ platform: 'instagram', profileUrl: null, verified: false }];
    bundle.observations.push(failed);
    const gap = gapOf(service.build(bundle, NOW), GapDimension.SOCIAL_PRESENCE);
    assert.equal(gap.state, GapState.UNKNOWN);
    assert.equal(gap.reasonCode, GapReasonCode.ABSENCE_NOT_ADMISSIBLE);
  });

  it('K: CRM is UNKNOWN and never inferred', () => {
    assert.equal(gapOf(service.build(baseBundle(), NOW), GapDimension.CRM_SYSTEM).state, GapState.UNKNOWN);
  });

  it('L: automation is UNKNOWN and never inferred', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book', hasContactForm: true }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.AUTOMATION).state, GapState.UNKNOWN);
  });

  it('M: AI usage is UNKNOWN even when tech hints could tempt a guess', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation());
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.AI_USAGE).state, GapState.UNKNOWN);
  });

  it('N: identical input yields identical classification', () => {
    const bundle = baseBundle();
    bundle.observations.push(
      observation({ bookingPageUrl: 'https://acme.example/book', whatsappUrl: 'https://wa.me/1' }),
    );
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: FETCHED_AT,
    });
    const first = service.build(bundle, NOW);
    const second = service.build(bundle, NOW);
    assert.deepEqual(second.gaps, first.gaps);
  });

  it('N2: classification does not depend on the clock', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const early = service.build(bundle, new Date('2026-01-01T00:00:00.000Z'));
    const late = service.build(bundle, new Date('2030-12-31T23:59:59.000Z'));
    assert.notEqual(early.computedAt, late.computedAt);
    assert.deepEqual(late.gaps, early.gaps);
  });

  it('O: every dimension carries a non-empty reason', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    for (const gap of service.build(bundle, NOW).gaps) {
      assert.ok(gap.reason.trim().length > 0, `${gap.dimension} has no reason`);
      assert.ok(Object.values(GapReasonCode).includes(gap.reasonCode));
    }
  });

  it('P: PRESENT results carry evidence references with provenance', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const gap = gapOf(service.build(bundle, NOW), GapDimension.BOOKING);
    assert.equal(gap.evidence.length, 1);
    assert.equal(gap.evidence[0].field, 'website.bookingPageUrl');
    assert.equal(gap.evidence[0].url, 'https://acme.example/book');
    assert.equal(gap.evidence[0].provider, 'http-website-enrichment');
    assert.equal(gap.evidence[0].observedAt, FETCHED_AT);
  });

  it('P2: evidence references never leak a raw payload', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ hasContactForm: true }));
    const gap = gapOf(service.build(bundle, NOW), GapDimension.CONTACT_CAPTURE);
    for (const reference of gap.evidence) {
      assert.deepEqual(Object.keys(reference).sort(), ['field', 'observedAt', 'provider', 'source', 'url']);
    }
  });

  it('Q: computedAt honours the injected clock', () => {
    assert.equal(service.build(baseBundle(), NOW).computedAt, NOW.toISOString());
  });

  it('R: an R4 UNKNOWN dimension is preserved rather than upgraded or downgraded', () => {
    const bundle = baseBundle();
    const withError = observation({ fetchedAt: null });
    withError.websiteCheckSucceeded = false;
    withError.websiteCheckFailed = true;
    withError.websiteFetchedAt = null;
    bundle.observations.push(withError);
    const analysis = service.build(bundle, NOW);
    assert.equal(gapOf(analysis, GapDimension.WEBSITE).state, GapState.UNKNOWN);
    assert.equal(gapOf(analysis, GapDimension.BASIC_DIGITAL_FOUNDATION).state, GapState.UNKNOWN);
  });

  it('S: conflicting observations resolve to the positive signal', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: null }));
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.BOOKING).state, GapState.PRESENT);
  });

  it('S2: a positive form signal is not cancelled by an absent one', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ hasContactForm: false }));
    bundle.observations.push(observation({ hasContactForm: true }));
    assert.equal(gapOf(service.build(bundle, NOW), GapDimension.CONTACT_CAPTURE).state, GapState.PRESENT);
  });

  it('T: no dimension is ever reported MISSING or NOT_APPLICABLE without admissible evidence', () => {
    const empty = service.build(baseBundle(), NOW);
    const withSignals = service.build(baseBundle(), NOW);
    for (const gap of [...empty.gaps, ...withSignals.gaps]) {
      assert.notEqual(gap.state, GapState.MISSING);
      assert.notEqual(gap.state, GapState.NOT_APPLICABLE);
    }
  });

  it('T2: aggregate dimensions follow their parents', () => {
    const bundle = baseBundle();
    bundle.observations.push(observation({ bookingPageUrl: 'https://acme.example/book' }));
    const analysis = service.build(bundle, NOW);
    assert.equal(gapOf(analysis, GapDimension.ONLINE_PRESENCE).state, GapState.PRESENT);
    assert.equal(gapOf(analysis, GapDimension.BASIC_DIGITAL_FOUNDATION).state, GapState.PRESENT);
    assert.equal(gapOf(analysis, GapDimension.ONLINE_PRESENCE).reasonCode, GapReasonCode.DERIVED_FROM_PARENT);
  });

  it('T3: the analysis exposes no scoring, recommendation, or priority fields', () => {
    const analysis = service.build(baseBundle(), NOW);
    assert.deepEqual(Object.keys(analysis).sort(), ['companyId', 'companyName', 'computedAt', 'gaps']);
    assert.deepEqual(Object.keys(gapOf(analysis, GapDimension.WEBSITE)).sort(), [
      'dimension',
      'evidence',
      'reason',
      'reasonCode',
      'state',
    ]);
  });

  it('T4: every dimension is reported exactly once in a stable order', () => {
    const analysis = service.build(baseBundle(), NOW);
    assert.deepEqual(
      analysis.gaps.map((gap) => gap.dimension),
      [
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
      ],
    );
  });
});
