import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompanyEvidenceBundle, EvidenceState, FactualDimension } from '../../domain/entities/company-intelligence.js';
import { CompanyIntelligenceService } from './company-intelligence.service.js';

const COMPANY_ID = 'company-1';
const COMPANY_NAME = 'Acme Corp';
const NOW = new Date('2026-06-15T12:00:00.000Z');

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

describe('CompanyIntelligenceService', () => {
  const service = new CompanyIntelligenceService();

  it('A: an observed website is OBSERVED, not absent', () => {
    const bundle = baseBundle();
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const website = service.build(bundle, NOW).dimensions[FactualDimension.WEBSITE];
    assert.equal(website.state, EvidenceState.OBSERVED);
    assert.equal(website.value, 'acme.example');
  });

  it('B: no website evidence is UNKNOWN', () => {
    const website = service.build(baseBundle(), NOW).dimensions[FactualDimension.WEBSITE];
    assert.equal(website.state, EvidenceState.UNKNOWN);
    assert.equal(website.count, 0);
    assert.equal(website.value, null);
  });

  it('C: a successfully fetched website is VERIFIED', () => {
    const bundle = baseBundle();
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    bundle.observations.push({
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceUrl: 'https://maps.example/place/acme',
      websiteDomain: 'acme.example',
      latitude: null,
      longitude: null,
      formattedAddress: null,
      websiteCheckSucceeded: true,
      websiteCheckFailed: false,
      websiteFetchedAt: '2026-05-01T00:00:00.000Z',
      socialChecks: [],
    });
    const website = service.build(bundle, NOW).dimensions[FactualDimension.WEBSITE];
    assert.equal(website.state, EvidenceState.VERIFIED);
    assert.ok(website.reasons.join(' ').includes('fetched successfully'));
  });

  it('D: a failed fetch downgrades the CHECK, never the observation', () => {
    const bundle = baseBundle();
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    bundle.observations.push({
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceUrl: 'https://maps.example/place/acme',
      websiteDomain: 'acme.example',
      latitude: null,
      longitude: null,
      formattedAddress: null,
      websiteCheckSucceeded: false,
      websiteCheckFailed: true,
      websiteFetchedAt: null,
      socialChecks: [],
    });
    const website = service.build(bundle, NOW).dimensions[FactualDimension.WEBSITE];
    assert.equal(website.state, EvidenceState.OBSERVED);
    assert.ok(!website.reasons.some((reason) => reason.toLowerCase().includes('no website evidence')));
    assert.ok(website.reasons.join(' ').toLowerCase().includes('not evidence of absence'));
  });

  it('E: an observed, source-backed email is VERIFIED', () => {
    const bundle = baseBundle();
    bundle.emails.push({
      value: 'hello@acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const email = service.build(bundle, NOW).dimensions[FactualDimension.EMAIL];
    assert.equal(email.state, EvidenceState.VERIFIED);
    assert.equal(email.value, 'hello@acme.example');
  });

  it('F: missing email is UNKNOWN', () => {
    const email = service.build(baseBundle(), NOW).dimensions[FactualDimension.EMAIL];
    assert.equal(email.state, EvidenceState.UNKNOWN);
  });

  it('G: an invalid observed email is FAILED, not UNKNOWN', () => {
    const bundle = baseBundle();
    bundle.emails.push({
      value: 'definitely-not-an-email@@example',
      evidenceSource: 'google-maps',
      evidenceUrl: 'https://maps.example/place/acme',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const email = service.build(bundle, NOW).dimensions[FactualDimension.EMAIL];
    assert.equal(email.state, EvidenceState.FAILED);
    assert.ok(email.reasons.join(' ').toLowerCase().includes('syntactic'));
  });

  it('H: an observed, provenance-backed phone is VERIFIED', () => {
    const bundle = baseBundle();
    bundle.phones.push({
      value: '+1 555 0100',
      countryCode: '+1',
      evidenceSource: 'google-maps',
      evidenceUrl: 'https://maps.example/place/acme',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const phone = service.build(bundle, NOW).dimensions[FactualDimension.PHONE];
    assert.equal(phone.state, EvidenceState.VERIFIED);
    assert.equal(phone.value, '+15550100');
  });

  it('I: multiple legitimate phones are not a conflict', () => {
    const bundle = baseBundle();
    bundle.phones.push(
      {
        value: '+15550100',
        countryCode: '+1',
        evidenceSource: 'google-maps',
        evidenceUrl: 'https://maps.example/x',
        observedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        value: '+15550101',
        countryCode: '+1',
        evidenceSource: 'google-maps',
        evidenceUrl: 'https://maps.example/y',
        observedAt: '2026-05-01T00:00:00.000Z',
      },
    );
    const phone = service.build(bundle, NOW).dimensions[FactualDimension.PHONE];
    assert.equal(phone.state, EvidenceState.VERIFIED);
    assert.equal(phone.count, 2);
    assert.notEqual(phone.state, EvidenceState.CONFLICTED);
  });

  it('J: a social profile reported active by a verification provider is VERIFIED', () => {
    const bundle = baseBundle();
    bundle.socialProfiles.push({
      platform: 'linkedin',
      handle: 'acme',
      profileUrl: 'https://www.linkedin.com/company/acme',
      evidenceSource: 'social-discovery',
      evidenceUrl: 'https://www.linkedin.com/company/acme',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    bundle.observations.push({
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceUrl: null,
      websiteDomain: null,
      latitude: null,
      longitude: null,
      formattedAddress: null,
      websiteCheckSucceeded: false,
      websiteCheckFailed: false,
      websiteFetchedAt: null,
      socialChecks: [{ platform: 'linkedin', profileUrl: 'https://www.linkedin.com/company/acme', verified: true }],
    });
    const social = service.build(bundle, NOW).dimensions[FactualDimension.SOCIAL];
    assert.equal(social.state, EvidenceState.VERIFIED);
  });

  it('K: no social evidence is UNKNOWN', () => {
    const social = service.build(baseBundle(), NOW).dimensions[FactualDimension.SOCIAL];
    assert.equal(social.state, EvidenceState.UNKNOWN);
  });

  it('L: coordinates with provenance are location evidence', () => {
    const bundle = baseBundle();
    bundle.observations.push({
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceUrl: 'https://maps.example/place/acme',
      websiteDomain: null,
      latitude: 51.5074,
      longitude: -0.1278,
      formattedAddress: null,
      websiteCheckSucceeded: false,
      websiteCheckFailed: false,
      websiteFetchedAt: null,
      socialChecks: [],
    });
    bundle.locations.push({
      formattedAddress: null,
      latitude: 51.5074,
      longitude: -0.1278,
      city: null,
      region: null,
      countryCode: null,
      evidenceSource: 'google-maps',
      evidenceUrl: 'https://maps.example/place/acme',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const location = service.build(bundle, NOW).dimensions[FactualDimension.LOCATION];
    assert.notEqual(location.state, EvidenceState.UNKNOWN);
    assert.ok(location.value?.startsWith('51.5074'));
  });

  it('M: missing location is UNKNOWN', () => {
    const location = service.build(baseBundle(), NOW).dimensions[FactualDimension.LOCATION];
    assert.equal(location.state, EvidenceState.UNKNOWN);
  });

  it('N: provenance quality reports evidenceless facts', () => {
    const bundle = baseBundle();
    bundle.emails.push({
      value: 'hello@acme.example',
      evidenceSource: null,
      evidenceUrl: null,
      observedAt: null,
    });
    const quality = service.build(bundle, NOW).quality;
    const emailProvenance = quality.provenance.dimensions.find((d) => d.dimension === FactualDimension.EMAIL);
    assert.equal(emailProvenance?.facts, 1);
    assert.equal(emailProvenance?.evidenced, 0);
    assert.equal(emailProvenance?.evidenceless, 1);
  });

  it('O: freshness preserves observedAt without an expiry threshold', () => {
    const bundle = baseBundle();
    bundle.websites.push({
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const summary = service.build(bundle, NOW);
    const freshness = summary.quality.freshness;
    assert.equal(freshness.latestObservedAt, '2026-05-01T00:00:00.000Z');
    assert.equal(
      freshness.dimensions.find((d) => d.dimension === FactualDimension.WEBSITE)?.ageMs,
      new Date(NOW).getTime() - new Date('2026-05-01T00:00:00.000Z').getTime(),
    );
    assert.ok(freshness.details.join(' ').includes('future policy decision'));
  });

  it('P: two distinct canonical websites are a conflict (single-valued property)', () => {
    const bundle = baseBundle();
    bundle.websites.push(
      {
        domain: 'acme.example',
        url: 'https://acme.example',
        evidenceSource: 'http-website-enrichment',
        evidenceUrl: 'https://acme.example',
        observedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        domain: 'acme-corp.example',
        url: 'https://acme-corp.example',
        evidenceSource: 'google-maps',
        evidenceUrl: 'https://maps.example/acme',
        observedAt: '2026-05-02T00:00:00.000Z',
      },
    );
    const website = service.build(bundle, NOW).dimensions[FactualDimension.WEBSITE];
    assert.equal(website.state, EvidenceState.CONFLICTED);
    assert.equal(website.count, 2);
  });

  it('Q: the same evidence yields a deterministic result for a fixed clock', () => {
    const bundle = baseBundle();
    bundle.phones.push({
      value: '+15550100',
      countryCode: '+1',
      evidenceSource: 'google-maps',
      evidenceUrl: 'https://maps.example/x',
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const first = service.build(bundle, NOW);
    const second = service.build(bundle, NOW);
    assert.deepEqual(first, second);
    assert.deepEqual(first, new CompanyIntelligenceService().build(bundle, NOW));
  });
});
