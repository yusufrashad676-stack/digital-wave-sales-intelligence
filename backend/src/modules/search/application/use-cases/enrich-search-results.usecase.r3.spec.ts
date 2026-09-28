import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnrichSearchResultsUseCase } from './enrich-search-results.usecase.js';
import { EnrichmentEngine } from '../services/enrichment-engine.js';
import { CanonicalPromotionService } from '../services/canonical-promotion.service.js';
import type { EnrichmentRepository, EnrichmentResultRow } from '../../domain/ports/enrichment.repository.js';
import type { WebsiteEnrichmentPort } from '../../domain/ports/website-enrichment.port.js';
import type {
  ContactPromotionEvidence,
  PromotionStatus,
  SocialPromotionEvidence,
  WebsitePromotionEvidence,
} from '../../domain/entities/canonical-evidence.js';
import type { CanonicalPromotionRepository } from '../../domain/ports/canonical-promotion.repository.js';

function makeResult(overrides: Partial<EnrichmentResultRow> = {}): EnrichmentResultRow {
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
    enrichmentStatus: 'PENDING',
    enrichmentSnapshot: null,
    ...overrides,
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    jobId: 'job-1',
    status: 'COMPLETED',
    jobUserId: 'user-1',
    metrics: null,
    ...overrides,
  };
}

function stubRepo(overrides: Partial<EnrichmentRepository> = {}): EnrichmentRepository {
  return {
    findResultsByExecutionId: async () => [makeResult()],
    findExecutionDetail: async () => makeExecution(),
    updateEnrichmentStatus: async () => {},
    resetStaleInProgress: async () => 0,
    countByEnrichmentStatus: async () => ({}),
    updateExecutionMetrics: async () => {},
    acquireEnrichmentLock: async () => true,
    releaseEnrichmentLock: async () => {},
    ...overrides,
  } as EnrichmentRepository;
}

function stubWebsiteProvider(overrides: Partial<WebsiteEnrichmentPort> = {}): WebsiteEnrichmentPort {
  return {
    providerId: 'http-website-enrichment',
    enrich: async (req) => ({
      domain: req.domain,
      data: {
        title: 'Test Dental',
        description: null,
        techHints: [],
        socialLinks: [],
        emails: ['info@test-dental.com'],
        fetchedAt: new Date().toISOString(),
        provider: 'http-website-enrichment',
      },
    }),
    ...overrides,
  };
}

function makeEngine(websiteOverrides?: Partial<WebsiteEnrichmentPort>): EnrichmentEngine {
  return new EnrichmentEngine(stubWebsiteProvider(websiteOverrides), undefined, undefined);
}

interface FakeRepo extends CanonicalPromotionRepository {
  websiteCalls: WebsitePromotionEvidence[];
  contactCalls: ContactPromotionEvidence[];
  socialCalls: SocialPromotionEvidence[];
  failNext: boolean;
}

function fakePromotionRepo(): FakeRepo {
  const repo: FakeRepo = {
    websiteCalls: [],
    contactCalls: [],
    socialCalls: [],
    failNext: false,
    promoteWebsite: async (_companyId, promotion) => {
      if (repo.failNext) throw new Error('promotion exploded');
      repo.websiteCalls.push(promotion);
      return { status: 'CREATED' as PromotionStatus };
    },
    promoteContactMethod: async (_companyId, promotion) => {
      repo.contactCalls.push(promotion);
      return { status: 'CREATED' as PromotionStatus };
    },
    promoteSocialProfile: async (_companyId, promotion) => {
      repo.socialCalls.push(promotion);
      return { status: 'CREATED' as PromotionStatus };
    },
  };
  return repo;
}

const principal = { userId: 'user-1', email: 't@t.com', roles: ['MEMBER'] as string[] };

describe('EnrichSearchResultsUseCase — R3 promotion + feature gate', () => {
  it('K: ENRICHMENT_ENABLED=false rejects enrichment without running the engine', async () => {
    const repo = stubRepo();
    let engineCalled = false;
    const engine = new EnrichmentEngine({
      providerId: 'http-website-enrichment',
      enrich: async () => {
        engineCalled = true;
        throw new Error('must not run');
      },
    } as WebsiteEnrichmentPort);

    const useCase = new EnrichSearchResultsUseCase(repo, engine, undefined, false);

    await assert.rejects(
      () => useCase.execute({ executionId: 'exec-1', principal }),
      (err: Error) => err.name === 'BusinessRuleException' && err.message.includes('ENRICHMENT_ENABLED'),
    );
    assert.equal(engineCalled, false);
  });

  it('L: ENRICHMENT_ENABLED=true runs enrichment and promotes canonical evidence', async () => {
    const repo = stubRepo();
    const promotion = fakePromotionRepo();
    const service = new CanonicalPromotionService(promotion);
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(), service, true);

    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.status, 'COMPLETED');
    assert.equal(promotion.websiteCalls.length, 1);
    assert.equal(promotion.websiteCalls[0].domain, 'test-dental.com');
    assert.equal(
      promotion.contactCalls.some((c) => c.type === 'phone'),
      true,
    );
    assert.equal(
      promotion.contactCalls.some((c) => c.type === 'email'),
      true,
    );
    assert.equal(promotion.contactCalls.find((c) => c.type === 'email')?.value, 'info@test-dental.com');
  });

  it('L2: multi-result run promotes every result once', async () => {
    const results = [
      makeResult({ id: 'r1', websiteDomain: 'a.com' }),
      makeResult({ id: 'r2', websiteDomain: 'b.com' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const promotion = fakePromotionRepo();
    const service = new CanonicalPromotionService(promotion);
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(), service, true);

    await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(promotion.websiteCalls.length, 2);
    assert.deepEqual(promotion.websiteCalls.map((w) => w.domain).sort(), ['a.com', 'b.com']);
  });

  it('M: website provider failure never promotes a website and does not corrupt the persisted result', async () => {
    const repo = stubRepo();
    const promotion = fakePromotionRepo();
    const failing = new EnrichmentEngine(makeWebsiteProviderThatThrows(), undefined, undefined);
    const service = new CanonicalPromotionService(promotion);
    const useCase = new EnrichSearchResultsUseCase(repo, failing, service, true);

    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.summary.failed, 1);
    assert.equal(promotion.websiteCalls.length, 0);
    // Provider-observed phone still promoted (not corrupted by the failure).
    assert.equal(
      promotion.contactCalls.some((c) => c.type === 'phone'),
      true,
    );
  });

  it('M3: a promotion failure is isolated — it does not flip an ENRICHED result to failed', async () => {
    const repo = stubRepo();
    const promotion = fakePromotionRepo();
    promotion.failNext = true;
    const service = new CanonicalPromotionService(promotion);
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(), service, true);

    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.status, 'COMPLETED');
    assert.equal(outcome.summary.enriched, 1);
    assert.equal(outcome.summary.failed, 0);
  });
});

function makeWebsiteProviderThatThrows(): WebsiteEnrichmentPort {
  return {
    providerId: 'http-website-enrichment',
    enrich: async () => {
      throw new Error('Fetch failed');
    },
  };
}
