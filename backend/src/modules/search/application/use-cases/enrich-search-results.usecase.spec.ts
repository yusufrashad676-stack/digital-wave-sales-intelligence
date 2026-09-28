import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnrichSearchResultsUseCase } from './enrich-search-results.usecase.js';
import { EnrichmentEngine } from '../services/enrichment-engine.js';
import type { EnrichmentRepository, EnrichmentResultRow } from '../../domain/ports/enrichment.repository.js';
import type { WebsiteEnrichmentPort } from '../../domain/ports/website-enrichment.port.js';
import type { SocialDiscoveryPort } from '../../domain/ports/social-discovery.port.js';
import type { SocialVerificationPort } from '../../domain/ports/social-verification.port.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';

function makeResult(overrides: Partial<EnrichmentResultRow> = {}): EnrichmentResultRow {
  return {
    id: 'result-1',
    executionId: 'exec-1',
    providerId: 'google-places',
    providerRecordId: 'rec-1',
    companyId: 'company-1',
    companyName: 'Test Dental Clinic',
    phone: '+201001234567',
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
  const statusUpdates: Array<{ id: string; status: string; snapshot: EnrichmentSnapshot | null }> = [];
  const metricsUpdates: Array<{ id: string; metrics: Record<string, unknown> }> = [];

  return {
    findResultsByExecutionId: async () => [makeResult()],
    findExecutionDetail: async () => makeExecution(),
    updateEnrichmentStatus: async (id, status, snapshot) => {
      statusUpdates.push({ id, status, snapshot });
    },
    resetStaleInProgress: async () => 0,
    countByEnrichmentStatus: async () => ({}),
    updateExecutionMetrics: async (id, metrics) => {
      metricsUpdates.push({ id, metrics });
    },
    acquireEnrichmentLock: async () => true,
    releaseEnrichmentLock: async () => {},
    _statusUpdates: statusUpdates,
    _metricsUpdates: metricsUpdates,
    ...overrides,
  } as EnrichmentRepository & {
    _statusUpdates: typeof statusUpdates;
    _metricsUpdates: typeof metricsUpdates;
  };
}

function stubWebsiteProvider(overrides: Partial<WebsiteEnrichmentPort> = {}): WebsiteEnrichmentPort {
  return {
    providerId: 'http-website-enrichment',
    enrich: async () => ({
      domain: 'test-dental.com',
      data: {
        title: 'Test Dental',
        description: 'Great dental services',
        techHints: ['wordpress'],
        socialLinks: ['facebook:test'],
        fetchedAt: new Date().toISOString(),
        provider: 'http-website-enrichment',
      },
    }),
    ...overrides,
  };
}

function stubSocialDiscovery(overrides: Partial<SocialDiscoveryPort> = {}): SocialDiscoveryPort {
  return {
    providerId: 'http-social-discovery',
    discover: async () => ({
      profiles: [
        { platform: 'facebook', handle: 'testdental', profileUrl: 'https://facebook.com/testdental', confidence: 0.9 },
      ],
      discoveredAt: new Date(),
      provider: 'http-social-discovery',
    }),
    ...overrides,
  };
}

function stubSocialVerification(overrides: Partial<SocialVerificationPort> = {}): SocialVerificationPort {
  return {
    providerId: 'http-social-verification',
    verify: async () => ({
      exists: true,
      active: true,
      displayName: 'Test Dental',
      verifiedAt: new Date(),
      provider: 'http-social-verification',
    }),
    ...overrides,
  };
}

function makeEngine(
  websiteOverrides?: Partial<WebsiteEnrichmentPort>,
  socialDiscOverrides?: Partial<SocialDiscoveryPort>,
  socialVerOverrides?: Partial<SocialVerificationPort>,
): EnrichmentEngine {
  return new EnrichmentEngine(
    stubWebsiteProvider(websiteOverrides),
    socialDiscOverrides !== undefined ? stubSocialDiscovery(socialDiscOverrides) : undefined,
    socialVerOverrides !== undefined ? stubSocialVerification(socialVerOverrides) : undefined,
  );
}

const principal = { userId: 'user-1', email: 'test@test.com', roles: ['MEMBER'] as string[] };

describe('EnrichSearchResultsUseCase', () => {
  it('enriches multiple results successfully', async () => {
    const results = [
      makeResult({ id: 'r1', providerRecordId: 'rec-1', websiteDomain: 'a.com' }),
      makeResult({ id: 'r2', providerRecordId: 'rec-2', websiteDomain: 'b.com' }),
      makeResult({ id: 'r3', providerRecordId: 'rec-3', websiteDomain: 'c.com' }),
    ];
    const repo = stubRepo({
      findResultsByExecutionId: async () => results,
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.status, 'COMPLETED');
    assert.equal(outcome.summary.total, 3);
    assert.equal(outcome.summary.enriched, 3);
    assert.equal(outcome.summary.failed, 0);
  });

  it('skips result without website when website enrichment is needed', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'a.com' }), makeResult({ id: 'r2', websiteDomain: null })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.summary.total, 2);
    // r1 enriched, r2 skipped (no website domain, no social)
    assert.equal(outcome.summary.enriched, 1);
    assert.equal(outcome.summary.skipped, 1);
  });

  it('one provider failure does not abort other results', async () => {
    const results = [
      makeResult({ id: 'r1', websiteDomain: 'ok.com' }),
      makeResult({ id: 'r2', websiteDomain: 'fail.com' }),
      makeResult({ id: 'r3', websiteDomain: 'also-ok.com' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });

    let callCount = 0;
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        callCount++;
        if (req.domain === 'fail.com') throw new Error('Network error');
        return {
          domain: req.domain,
          data: {
            title: 'OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'http-website-enrichment',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(callCount, 3);
    assert.equal(outcome.summary.enriched, 2);
    assert.equal(outcome.summary.failed, 1);
    assert.equal(outcome.status, 'PARTIALLY_COMPLETED');
  });

  it('handles multiple provider failures', async () => {
    const results = [
      makeResult({ id: 'r1', websiteDomain: 'fail1.com' }),
      makeResult({ id: 'r2', websiteDomain: 'fail2.com' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const provider = stubWebsiteProvider({
      enrich: async () => {
        throw new Error('Provider down');
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.summary.failed, 2);
    assert.equal(outcome.summary.enriched, 0);
    assert.equal(outcome.status, 'FAILED');
  });

  it('produces partial enrichment outcome', async () => {
    const results = [
      makeResult({ id: 'r1', websiteDomain: 'ok.com' }),
      makeResult({ id: 'r2', websiteDomain: 'fail.com' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        if (req.domain === 'fail.com') throw new Error('Timeout');
        return {
          domain: req.domain,
          data: {
            title: 'OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'http-website-enrichment',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.status, 'PARTIALLY_COMPLETED');
    assert.equal(outcome.summary.enriched, 1);
    assert.equal(outcome.summary.failed, 1);
  });

  it('records errors in snapshot on provider failure', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'fail.com' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const provider = stubWebsiteProvider({
      enrich: async () => {
        throw new Error('Connection refused');
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    await useCase.execute({ executionId: 'exec-1', principal });

    const updates = (repo as unknown as { _statusUpdates: Array<{ snapshot: EnrichmentSnapshot | null }> })
      ._statusUpdates;
    const finalUpdate = updates.find((u) => u.snapshot?.errors && u.snapshot.errors.length > 0);
    assert.ok(finalUpdate, 'Expected an update with errors');
    assert.equal(finalUpdate!.snapshot!.errors![0].type, 'website');
    assert.equal(finalUpdate!.snapshot!.errors![0].message, 'Connection refused');
  });

  it('respects skipWebsite flag', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'a.com' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    let enrichCalled = false;
    const provider = stubWebsiteProvider({
      enrich: async () => {
        enrichCalled = true;
        throw new Error('should not be called');
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({
      executionId: 'exec-1',
      principal,
      options: { skipWebsite: true },
    });

    assert.equal(enrichCalled, false);
    assert.equal(outcome.summary.skipped, 1);
  });

  it('respects skipSocial flag', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'a.com' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    let discoverCalled = false;
    const socialDisc = stubSocialDiscovery({
      discover: async () => {
        discoverCalled = true;
        throw new Error('should not be called');
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(undefined, socialDisc));
    const outcome = await useCase.execute({
      executionId: 'exec-1',
      principal,
      options: { skipSocial: true },
    });

    assert.equal(discoverCalled, false);
    assert.equal(outcome.summary.enriched, 1);
  });

  it('respects configured concurrency', async () => {
    const results = Array.from({ length: 6 }, (_, i) =>
      makeResult({ id: `r${i}`, providerRecordId: `rec-${i}`, websiteDomain: `site${i}.com` }),
    );
    const repo = stubRepo({ findResultsByExecutionId: async () => results });

    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return {
          domain: req.domain,
          data: {
            title: 'OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'http-website-enrichment',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    await useCase.execute({
      executionId: 'exec-1',
      principal,
      options: { concurrency: 2 },
    });

    assert.ok(maxConcurrent <= 2, `Expected max concurrency <= 2, got ${maxConcurrent}`);
  });

  it('transitions enrichment status correctly', async () => {
    const results = [makeResult({ id: 'r1' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await useCase.execute({ executionId: 'exec-1', principal });

    const updates = (repo as unknown as { _statusUpdates: Array<{ status: string }> })._statusUpdates;
    const statusSequence = updates.map((u) => u.status);
    assert.deepEqual(statusSequence, ['IN_PROGRESS', 'ENRICHED']);
  });

  it('updates execution metrics correctly', async () => {
    const results = [
      makeResult({ id: 'r1', websiteDomain: 'ok.com' }),
      makeResult({ id: 'r2', websiteDomain: 'fail.com' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        if (req.domain === 'fail.com') throw new Error('err');
        return {
          domain: req.domain,
          data: {
            title: 'OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'test',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    await useCase.execute({ executionId: 'exec-1', principal });

    const metricsUpdates = (repo as unknown as { _metricsUpdates: Array<{ metrics: Record<string, unknown> }> })
      ._metricsUpdates;
    assert.ok(metricsUpdates.length > 0);
    const metrics = metricsUpdates[0].metrics;
    assert.equal(metrics.enrichedCount, 1);
    assert.equal(metrics.enrichmentFailedCount, 1);
    assert.equal(typeof metrics.enrichmentDurationMs, 'number');
  });

  it('handles empty execution (no results)', async () => {
    const repo = stubRepo({ findResultsByExecutionId: async () => [] });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.status, 'COMPLETED');
    assert.equal(outcome.summary.total, 0);
    assert.equal(outcome.summary.enriched, 0);
  });

  it('skips already-enriched results', async () => {
    const results = [
      makeResult({ id: 'r1', enrichmentStatus: 'ENRICHED' }),
      makeResult({ id: 'r2', enrichmentStatus: 'PENDING' }),
    ];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    let enrichCount = 0;
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        enrichCount++;
        return {
          domain: req.domain,
          data: {
            title: 'OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'test',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(enrichCount, 1);
    assert.equal(outcome.summary.total, 2);
    assert.equal(outcome.summary.enriched, 1);
  });

  it('retries ENRICHMENT_FAILED results', async () => {
    const results = [makeResult({ id: 'r1', enrichmentStatus: 'ENRICHMENT_FAILED' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    let enrichCount = 0;
    const provider = stubWebsiteProvider({
      enrich: async (req) => {
        enrichCount++;
        return {
          domain: req.domain,
          data: {
            title: 'Retry OK',
            description: null,
            techHints: [],
            socialLinks: [],
            fetchedAt: new Date().toISOString(),
            provider: 'test',
          },
        };
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(provider));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(enrichCount, 1);
    assert.equal(outcome.summary.enriched, 1);
  });

  it('rejects execution not found', async () => {
    const repo = stubRepo({ findExecutionDetail: async () => null });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await assert.rejects(
      () => useCase.execute({ executionId: 'missing', principal }),
      (err: Error) => err.name === 'NotFoundException',
    );
  });

  it('rejects execution not completed', async () => {
    const repo = stubRepo({ findExecutionDetail: async () => makeExecution({ status: 'RUNNING' }) });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await assert.rejects(
      () => useCase.execute({ executionId: 'exec-1', principal }),
      (err: Error) => err.name === 'BusinessRuleException',
    );
  });

  it('rejects execution owned by another user', async () => {
    const repo = stubRepo({
      findExecutionDetail: async () => makeExecution({ jobUserId: 'other-user' }),
    });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await assert.rejects(
      () => useCase.execute({ executionId: 'exec-1', principal }),
      (err: Error) => err.name === 'ForbiddenException',
    );
  });

  it('rejects execution with null job owner (no null-bypass)', async () => {
    const repo = stubRepo({
      findExecutionDetail: async () => makeExecution({ jobUserId: null }),
    });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await assert.rejects(
      () => useCase.execute({ executionId: 'exec-1', principal }),
      (err: Error) => err.name === 'ForbiddenException',
    );
  });

  it('rejects execution whose job is soft-deleted (repo resolves to null)', async () => {
    const repo = stubRepo({ findExecutionDetail: async () => null });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await assert.rejects(
      () => useCase.execute({ executionId: 'exec-1', principal }),
      (err: Error) => err.name === 'NotFoundException',
    );
  });

  it('resets stale IN_PROGRESS results before enrichment', async () => {
    let resetCalled = false;
    const repo = stubRepo({
      resetStaleInProgress: async () => {
        resetCalled = true;
        return 2;
      },
    });
    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine());

    await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(resetCalled, true);
  });

  it('enriches with social discovery when port is available', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'a.com' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const socialDisc = stubSocialDiscovery();
    const socialVer = stubSocialVerification();

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(undefined, socialDisc, socialVer));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    assert.equal(outcome.summary.enriched, 1);
    assert.equal(outcome.summary.socialProfilesFound, 1);
    assert.equal(outcome.summary.socialProfilesVerified, 1);

    // Verify snapshot contains social data
    const updates = (repo as unknown as { _statusUpdates: Array<{ snapshot: EnrichmentSnapshot | null }> })
      ._statusUpdates;
    const enriched = updates.find((u) => u.status === 'ENRICHED');
    assert.ok(enriched?.snapshot?.social);
    assert.equal(enriched!.snapshot!.social!.profiles.length, 1);
    assert.equal(enriched!.snapshot!.social!.profiles[0].verified, true);
  });

  it('social provider failure does not abort website enrichment', async () => {
    const results = [makeResult({ id: 'r1', websiteDomain: 'a.com' })];
    const repo = stubRepo({ findResultsByExecutionId: async () => results });
    const socialDisc = stubSocialDiscovery({
      discover: async () => {
        throw new Error('Social provider down');
      },
    });

    const useCase = new EnrichSearchResultsUseCase(repo, makeEngine(undefined, socialDisc));
    const outcome = await useCase.execute({ executionId: 'exec-1', principal });

    // Website was enriched, social failed → PARTIALLY_ENRICHED
    assert.equal(outcome.summary.enriched, 0);
    assert.equal(outcome.summary.partiallyEnriched, 1);
    assert.equal(outcome.status, 'PARTIALLY_COMPLETED');
  });
});
