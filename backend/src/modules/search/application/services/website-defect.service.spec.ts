import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  WebsiteHttpObservation,
} from '../../domain/entities/company-intelligence.js';
import {
  WebsiteDefectClass,
  WebsiteDefectReasonCode,
  WebsiteDefectState,
} from '../../domain/entities/website-defect.js';
import { CompanyWebsiteDefectService } from './website-defect.service.js';

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

function httpObs(overrides: Partial<WebsiteHttpObservation> = {}): WebsiteHttpObservation {
  return {
    httpStatus: 200,
    httpRedirected: false,
    httpFinalUrl: 'https://acme.example',
    httpFinalSameOrigin: true,
    ...overrides,
  };
}

function observation(
  http: WebsiteHttpObservation | null,
  overrides: Partial<CompanyObservationInput> = {},
): CompanyObservationInput {
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
    websiteCapabilities: {
      provider: 'http-website-enrichment',
      fetchedAt: FETCHED_AT,
      bodyAnalyzed: true,
      reachable: true,
      https: true,
      contactPageUrl: null,
      hasContactForm: false,
      bookingPageUrl: null,
      whatsappUrl: null,
    },
    websiteHttp: http,
    socialChecks: [],
    ...overrides,
  };
}

describe('CompanyWebsiteDefectService', () => {
  const service = new CompanyWebsiteDefectService();

  describe('classification', () => {
    it('500 -> DEFECT_OBSERVED / SERVER_ERROR', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.equal(report.defectClass, WebsiteDefectClass.SERVER_ERROR);
      assert.equal(report.httpStatus, 500);
    });

    it('503 -> DEFECT_OBSERVED / SERVER_ERROR', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 503 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.equal(report.defectClass, WebsiteDefectClass.SERVER_ERROR);
    });

    it('404 -> DEFECT_OBSERVED / NOT_FOUND', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 404 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.equal(report.defectClass, WebsiteDefectClass.NOT_FOUND);
    });

    it('410 -> DEFECT_OBSERVED / NOT_FOUND', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 410 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.equal(report.defectClass, WebsiteDefectClass.NOT_FOUND);
    });

    it('200 -> NO_TARGET_DEFECT_OBSERVED', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 200 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED);
      assert.equal(report.defectClass, null);
    });

    it('204 -> NO_TARGET_DEFECT_OBSERVED', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 204 }))), NOW);
      assert.equal(report.state, WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED);
    });

    for (const [name, status] of [
      ['401', 401],
      ['403', 403],
      ['408', 408],
      ['429', 429],
      ['444', 444],
      ['418', 418],
    ]) {
      it(`${name} is not a defect`, () => {
        const report = service.build(bundleWith(observation(httpObs({ httpStatus: status }))), NOW);
        assert.equal(report.state, WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED);
        assert.equal(report.defectClass, null);
      });
    }

    it('final 3xx -> UNKNOWN (redirect chain incomplete), never a defect', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 301, httpRedirected: true }))), NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.REDIRECT_CHAIN_INCOMPLETE);
    });

    it('cross-origin final 404 -> UNKNOWN', () => {
      const report = service.build(
        bundleWith(
          observation(
            httpObs({ httpStatus: 404, httpFinalUrl: 'https://cdn.example/error', httpFinalSameOrigin: false }),
          ),
        ),
        NOW,
      );
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.CROSS_ORIGIN_FINAL_RESPONSE);
    });

    it('cross-origin final 500 -> UNKNOWN', () => {
      const report = service.build(
        bundleWith(observation(httpObs({ httpStatus: 500, httpFinalSameOrigin: false }))),
        NOW,
      );
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.CROSS_ORIGIN_FINAL_RESPONSE);
    });

    it('unparseable final URL -> UNKNOWN', () => {
      const report = service.build(
        bundleWith(observation(httpObs({ httpStatus: 500, httpFinalSameOrigin: null }))),
        NOW,
      );
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.FINAL_URL_MALFORMED);
    });

    it('missing final URL -> UNKNOWN', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500, httpFinalUrl: null }))), NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.FINAL_URL_UNKNOWN);
    });

    it('no status -> UNKNOWN', () => {
      const report = service.build(
        bundleWith(observation(httpObs({ httpStatus: null, httpFinalUrl: 'https://acme.example' }))),
        NOW,
      );
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.HTTP_STATUS_MISSING);
    });

    it('historical row (no websiteHttp) -> UNKNOWN, no observations', () => {
      const report = service.build(bundleWith(observation(null)), NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.reasonCode, WebsiteDefectReasonCode.NO_HTTP_OBSERVATION);
      assert.equal(report.httpStatus, null);
      assert.equal(report.defectClass, null);
      assert.deepEqual(report.observations, []);
    });

    it('empty bundle -> UNKNOWN', () => {
      const report = service.build(baseBundle(), NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.reasonCode, WebsiteDefectReasonCode.NO_HTTP_OBSERVATION);
    });

    it('missing requested URL -> UNKNOWN, never a defect', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500 }), { websiteDomain: null })), NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.observations[0].reasonCode, WebsiteDefectReasonCode.REQUESTED_URL_UNKNOWN);
      assert.equal(report.reasonCode, WebsiteDefectReasonCode.NO_ADMISSIBLE_OBSERVATION);
    });
  });

  describe('explainability', () => {
    it('reason says the observed HTTP status, not "site down"', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500 }))), NOW);
      assert.ok(report.reason.includes('HTTP 500 was observed'));
      assert.ok(!report.reason.toLowerCase().includes('down'));
      assert.ok(!report.reason.toLowerCase().includes('broken'));
    });

    it('NO_TARGET_DEFECT_OBSERVED explicitly does not claim health', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 200 }))), NOW);
      assert.ok(report.reason.toLowerCase().includes('does not establish that the website is healthy'));
    });

    it('evidence carries pointers only and never a raw payload', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500 }))), NOW);
      const evidence = report.observations[0].evidence[0];
      assert.equal(evidence.source, 'search-result-enrichment');
      assert.equal(evidence.field, 'website.httpStatus');
      assert.equal(evidence.finalUrl, 'https://acme.example');
      assert.equal(evidence.observedAt, FETCHED_AT);
      assert.deepEqual(Object.keys(evidence).sort(), [
        'field',
        'finalUrl',
        'observedAt',
        'provider',
        'requestedUrl',
        'source',
      ]);
    });

    it('exposes engineVersion and computedAt', () => {
      const report = service.build(bundleWith(observation(httpObs({ httpStatus: 500 }))), NOW);
      assert.equal(report.engineVersion, 1);
      assert.equal(report.computedAt, NOW.toISOString());
    });

    it('computedAt is metadata only and does not alter classification', () => {
      const first = service.build(
        bundleWith(observation(httpObs({ httpStatus: 500 }))),
        now('2026-01-01T00:00:00.000Z'),
      );
      const second = service.build(
        bundleWith(observation(httpObs({ httpStatus: 500 }))),
        now('2026-12-31T00:00:00.000Z'),
      );
      assert.equal(first.state, second.state);
      assert.deepEqual(first.observations, second.observations);
      assert.notEqual(first.computedAt, second.computedAt);
    });
  });

  describe('multiple observations', () => {
    const LATER = '2026-06-01T00:00:00.000Z';

    it('orders observations deterministically by observedAt', () => {
      const bundle = baseBundle();
      bundle.observations.push(
        observation(httpObs({ httpStatus: 500 }), { websiteCapabilities: withFetchedAt(LATER) }),
      );
      bundle.observations.push(observation(httpObs({ httpStatus: 404 })));
      const report = service.build(bundle, NOW);
      assert.deepEqual(
        report.observations.map((item) => item.httpStatus),
        [404, 500],
      );
    });

    it('dedupes duplicate evidence so identical observations collapse', () => {
      const bundle = baseBundle();
      bundle.observations.push(observation(httpObs({ httpStatus: 500 })));
      bundle.observations.push(observation(httpObs({ httpStatus: 500 })));
      const report = service.build(bundle, NOW);
      assert.equal(report.observations.length, 1);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
    });

    it('a defect observation remains reportable alongside a non-defect observation', () => {
      const bundle = baseBundle();
      bundle.observations.push(
        observation(httpObs({ httpStatus: 200 }), { websiteCapabilities: withFetchedAt(LATER) }),
      );
      bundle.observations.push(observation(httpObs({ httpStatus: 500 })));
      const report = service.build(bundle, NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.equal(report.httpStatus, 500);
      assert.equal(report.observations.length, 2);
    });

    it('does not invent "current" semantics: an older defect is still reported as observed', () => {
      const bundle = baseBundle();
      bundle.observations.push(observation(httpObs({ httpStatus: 500 })));
      const report = service.build(bundle, NOW);
      assert.equal(report.state, WebsiteDefectState.DEFECT_OBSERVED);
      assert.ok(report.reason.includes('was observed'));
      assert.ok(!report.reason.toLowerCase().includes('currently'));
    });

    it('only UNKNOWN observations aggregate to UNKNOWN', () => {
      const bundle = baseBundle();
      bundle.observations.push(observation(httpObs({ httpStatus: 301, httpRedirected: true })));
      bundle.observations.push(observation(httpObs({ httpStatus: 500, httpFinalSameOrigin: false })));
      const report = service.build(bundle, NOW);
      assert.equal(report.state, WebsiteDefectState.UNKNOWN);
      assert.equal(report.reasonCode, WebsiteDefectReasonCode.NO_ADMISSIBLE_OBSERVATION);
      assert.deepEqual(
        report.observations.map((item) => item.reasonCode),
        // Deterministic order: observedAt asc, then finalUrl, then requestedUrl, then httpStatus.
        [WebsiteDefectReasonCode.REDIRECT_CHAIN_INCOMPLETE, WebsiteDefectReasonCode.CROSS_ORIGIN_FINAL_RESPONSE],
      );
    });
  });
});

function bundleWith(obs: CompanyObservationInput): CompanyEvidenceBundle {
  const bundle = baseBundle();
  bundle.observations.push(obs);
  return bundle;
}

function now(iso: string): Date {
  return new Date(iso);
}

function withFetchedAt(iso: string): CompanyObservationInput['websiteCapabilities'] {
  return {
    provider: 'http-website-enrichment',
    fetchedAt: iso,
    bodyAnalyzed: true,
    reachable: true,
    https: true,
    contactPageUrl: null,
    hasContactForm: false,
    bookingPageUrl: null,
    whatsappUrl: null,
  };
}
