import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ContactPromotionEvidence,
  PromotionStatus,
  SocialPromotionEvidence,
  WebsitePromotionEvidence,
} from '../../domain/entities/canonical-evidence.js';
import type { CanonicalPromotionRepository } from '../../domain/ports/canonical-promotion.repository.js';
import type { EnrichmentResultRow } from '../../domain/ports/enrichment.repository.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import { CanonicalPromotionService } from './canonical-promotion.service.js';

function makeRow(overrides: Partial<EnrichmentResultRow> = {}): EnrichmentResultRow {
  return {
    id: 'result-1',
    executionId: 'exec-1',
    providerId: 'google-places',
    providerRecordId: 'rec-1',
    companyId: 'company-1',
    companyName: 'Test Dental Clinic',
    phone: '+20 100 123 4567',
    email: null,
    websiteDomain: 'test-dental.com',
    sourceUrl: 'https://maps.google.com/place/rec-1',
    retrievedAt: new Date('2026-08-10T10:00:00.000Z'),
    enrichmentStatus: 'ENRICHED',
    enrichmentSnapshot: null,
    ...overrides,
  };
}

function makeWebsiteSnapshot(overrides: Partial<EnrichmentSnapshot['website']> = {}): EnrichmentSnapshot {
  return {
    enrichedAt: '2026-08-10T11:00:00.000Z',
    enrichmentVersion: 1,
    website: {
      title: 'Test Dental',
      description: 'Great dental services',
      techHints: ['wordpress'],
      socialLinks: ['facebook:test'],
      emails: ['Info@Test-Dental.COM'],
      fetchedAt: '2026-08-10T11:00:00.000Z',
      provider: 'http-website-enrichment',
      ...overrides,
    },
  };
}

function makeSocialSnapshot(overrides = {}): EnrichmentSnapshot {
  return {
    enrichedAt: '2026-08-10T11:00:00.000Z',
    enrichmentVersion: 1,
    social: {
      profiles: [
        {
          platform: 'facebook',
          handle: 'testdental',
          profileUrl: 'https://facebook.com/testdental',
          confidence: 0.9,
          verified: false,
        },
      ],
      discoveredAt: '2026-08-10T11:00:00.000Z',
      provider: 'http-social-discovery',
    },
    ...overrides,
  };
}

interface FakeRepo extends CanonicalPromotionRepository {
  websiteCalls: WebsitePromotionEvidence[];
  contactCalls: ContactPromotionEvidence[];
  socialCalls: SocialPromotionEvidence[];
  status: PromotionStatus;
}

function serviceFor(): { service: CanonicalPromotionService; repo: FakeRepo } {
  const repo: FakeRepo = {
    websiteCalls: [],
    contactCalls: [],
    socialCalls: [],
    status: 'CREATED',
    promoteWebsite: async (_companyId, promotion) => {
      repo.websiteCalls.push(promotion);
      return { status: repo.status };
    },
    promoteContactMethod: async (_companyId, promotion) => {
      repo.contactCalls.push(promotion);
      return { status: repo.status };
    },
    promoteSocialProfile: async (_companyId, promotion) => {
      repo.socialCalls.push(promotion);
      return { status: repo.status };
    },
  };
  return { service: new CanonicalPromotionService(repo), repo };
}

describe('CanonicalPromotionService', () => {
  it('A: promotes an observed website into a canonical Website', async () => {
    const { service, repo } = serviceFor();
    const summary = await service.promoteFromEnrichment(makeRow(), makeWebsiteSnapshot());

    assert.equal(summary.website?.status, 'CREATED');
    assert.equal(repo.websiteCalls.length, 1);
    const call = repo.websiteCalls[0];
    assert.equal(call.domain, 'test-dental.com');
    assert.equal(call.url, 'https://test-dental.com');
    assert.equal(call.title, 'Test Dental');
    assert.deepEqual(call.techHints, ['wordpress']);
  });

  it('B: repeated promotion builds the same website evidence (DB enforces one active row)', async () => {
    const { service, repo } = serviceFor();
    const row = makeRow();
    const snapshot = makeWebsiteSnapshot();
    await service.promoteFromEnrichment(row, snapshot);
    await service.promoteFromEnrichment(row, snapshot);

    assert.equal(repo.websiteCalls.length, 2);
    assert.deepEqual(repo.websiteCalls[0], repo.websiteCalls[1]);
  });

  it('C: observed email normalizes into a canonical phone-type ContactMethod', async () => {
    const { service, repo } = serviceFor();
    await service.promoteFromEnrichment(makeRow(), makeWebsiteSnapshot());

    const emailCalls = repo.contactCalls.filter((c) => c.type === 'email');
    assert.equal(emailCalls.length, 1);
    assert.equal(emailCalls[0].value, 'info@test-dental.com');
    assert.equal(emailCalls[0].evidenceSource, 'http-website-enrichment');
  });

  it('D: no observable email produces no negative ContactMethod claim', async () => {
    const { service, repo } = serviceFor();
    const row = makeRow({ email: null, phone: null });
    const snapshot = makeWebsiteSnapshot({ emails: ['clearly-invalid-email'] });

    await service.promoteFromEnrichment(row, snapshot);

    assert.equal(repo.contactCalls.length, 0);
  });

  it('E: provider phone is normalized and promoted with an observed country code', async () => {
    const { service, repo } = serviceFor();
    await service.promoteFromEnrichment(makeRow({ phone: '+20 100 123 4567', websiteDomain: null }), {
      enrichedAt: 'x',
      enrichmentVersion: 1,
    });

    const phoneCalls = repo.contactCalls.filter((c) => c.type === 'phone');
    assert.equal(phoneCalls.length, 1);
    assert.equal(phoneCalls[0].value, '+201001234567');
    assert.equal(phoneCalls[0].countryCode, '+20');
    assert.equal(phoneCalls[0].evidenceSource, 'google-places');
    assert.equal(phoneCalls[0].evidenceUrl, 'https://maps.google.com/place/rec-1');
  });

  it('E2: a local number is promoted without a fabricated country code', async () => {
    const { service, repo } = serviceFor();
    await service.promoteFromEnrichment(makeRow({ phone: '0100 123 4567', websiteDomain: null }), {
      enrichedAt: 'x',
      enrichmentVersion: 1,
    });

    const phoneCalls = repo.contactCalls.filter((c) => c.type === 'phone');
    assert.equal(phoneCalls[0].value, '01001234567');
    assert.equal(phoneCalls[0].countryCode, undefined);
  });

  it('F: discovered social profiles are promoted', async () => {
    const { service, repo } = serviceFor();
    await service.promoteFromEnrichment(makeRow(), makeSocialSnapshot());

    assert.equal(repo.socialCalls.length, 1);
    const call = repo.socialCalls[0];
    assert.equal(call.platform, 'facebook');
    assert.equal(call.profileUrl, 'https://facebook.com/testdental');
    assert.equal(call.evidenceSource, 'http-social-discovery');
    assert.equal(call.observedAt?.toISOString(), '2026-08-10T11:00:00.000Z');
  });

  it('G: no social snapshot produces no social promotions (never a negative claim)', async () => {
    const { service, repo } = serviceFor();
    await service.promoteFromEnrichment(makeRow(), { enrichedAt: 'x', enrichmentVersion: 1 });

    assert.equal(repo.socialCalls.length, 0);
  });

  it('P: provenance is populated only where evidence exists', async () => {
    const { service, repo } = serviceFor();
    const snapshot = makeWebsiteSnapshot({ emails: ['info@test-dental.com'] });
    await service.promoteFromEnrichment(makeRow(), snapshot);

    const website = repo.websiteCalls[0];
    assert.equal(website.evidenceSource, 'http-website-enrichment');
    assert.equal(website.evidenceUrl, 'https://test-dental.com');
    assert.equal(website.observedAt?.toISOString(), '2026-08-10T11:00:00.000Z');

    const email = repo.contactCalls.find((c) => c.type === 'email');
    assert.equal(email?.evidenceSource, 'http-website-enrichment');
    assert.equal(email?.evidenceUrl, 'https://test-dental.com');
  });

  it('skips all promotion when the result has no company link (companyId null)', async () => {
    const { service, repo } = serviceFor();
    const summary = await service.promoteFromEnrichment(makeRow({ companyId: null }), makeSocialSnapshot());

    assert.equal(summary.website, null);
    assert.equal(repo.websiteCalls.length, 0);
    assert.equal(repo.contactCalls.length, 0);
    assert.equal(repo.socialCalls.length, 0);
  });

  it('M2: failed website fetch leaves only phone evidence (no website, no fabricated claim)', async () => {
    const { service, repo } = serviceFor();
    // Snapshot has only errors (engine recorded the fetch failure) — no website data.
    const failed = {
      enrichedAt: '2026-08-10T11:00:00.000Z',
      enrichmentVersion: 1,
      errors: [{ type: 'website' as const, message: 'Fetch failed', provider: 'http-website-enrichment' }],
    };
    await service.promoteFromEnrichment(makeRow(), failed);

    assert.equal(repo.websiteCalls.length, 0);
    assert.equal(repo.contactCalls.length, 1); // only provider-observed phone
    assert.equal(repo.contactCalls[0].type, 'phone');
    assert.equal(repo.contactCalls[0].value, '+201001234567');
  });
});
