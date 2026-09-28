import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '../../../../common/exceptions/conflict.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { STALE_IN_PROGRESS_MS, EnrichLeadUseCase } from './enrich-lead.usecase.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import type { LeadEnrichmentSnapshot } from '../../domain/entities/lead.entity.js';
import { EnrichmentEngine } from '../../../search/application/services/enrichment-engine.js';
import type { WebsiteEnrichmentPort } from '../../../search/domain/ports/website-enrichment.port.js';
import type { SocialDiscoveryPort } from '../../../search/domain/ports/social-discovery.port.js';
import { leadSnapshot } from './lead-snapshot.fixture.js';

function stubRepo(overrides: Partial<LeadRepository> = {}): LeadRepository & {
  claimCalls: Array<{ userId: string; leadId: string; staleThresholdMs: number }>;
  persistCalls: Array<{ userId: string; leadId: string; status: string; snapshot: LeadEnrichmentSnapshot | null }>;
} {
  const claimCalls: Array<{ userId: string; leadId: string; staleThresholdMs: number }> = [];
  const persistCalls: Array<{
    userId: string;
    leadId: string;
    status: string;
    snapshot: LeadEnrichmentSnapshot | null;
  }> = [];
  return {
    claimCalls,
    persistCalls,
    save: async () => leadSnapshot(),
    listByUser: async () => [],
    findOwned: async () => leadSnapshot(),
    update: async () => null,
    remove: async () => true,
    claimForEnrichment: async (userId, leadId, staleThresholdMs) => {
      claimCalls.push({ userId, leadId, staleThresholdMs });
      return true;
    },
    updateEnrichmentResult: async (userId, leadId, status, snapshot) => {
      persistCalls.push({ userId, leadId, status, snapshot });
      return leadSnapshot({
        enrichmentStatus: status,
        enrichmentSnapshot: snapshot,
        enrichedAt: new Date().toISOString(),
      });
    },
    ...overrides,
  } as unknown as LeadRepository & {
    claimCalls: typeof claimCalls;
    persistCalls: typeof persistCalls;
  };
}

function stubEngine(overrides: Partial<WebsiteEnrichmentPort> = {}): EnrichmentEngine {
  return new EnrichmentEngine({
    providerId: 'http-website-enrichment',
    enrich: async () => ({
      domain: 'abuqir-seafood.example.com',
      data: {
        title: 'Abu Qir Seafood',
        description: 'Fresh seafood',
        techHints: ['wordpress'],
        socialLinks: [],
        fetchedAt: new Date().toISOString(),
        provider: 'http-website-enrichment',
      },
    }),
    ...overrides,
  } as WebsiteEnrichmentPort);
}

function failedEngine(): EnrichmentEngine {
  return new EnrichmentEngine({
    providerId: 'http-website-enrichment',
    enrich: async () => {
      throw new Error('Connection refused');
    },
  } as WebsiteEnrichmentPort);
}

function skippedEngine(): EnrichmentEngine {
  return new EnrichmentEngine({
    providerId: 'http-website-enrichment',
    enrich: async () => {
      throw new Error('should not be called');
    },
  } as WebsiteEnrichmentPort);
}

describe('EnrichLeadUseCase', () => {
  it('enriches a lead successfully', async () => {
    const repo = stubRepo();
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.equal(result.lead.id, 'lead-1');
    assert.equal(result.lead.enrichmentStatus, 'ENRICHED');
    assert.ok(result.lead.enrichmentSnapshot);
    assert.ok(result.durationMs >= 0);
    assert.equal(repo.claimCalls.length, 1);
    assert.equal(repo.claimCalls[0]?.userId, 'user-1');
    assert.equal(repo.claimCalls[0]?.leadId, 'lead-1');
    assert.equal(repo.claimCalls[0]?.staleThresholdMs, STALE_IN_PROGRESS_MS);
    assert.equal(repo.persistCalls.length, 1);
    assert.equal(repo.persistCalls[0]?.status, 'ENRICHED');
  });

  it('throws NotFoundException when lead does not exist', async () => {
    const repo = stubRepo({ findOwned: async () => null });
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    await assert.rejects(() => useCase.enrich({ leadId: 'missing', userId: 'user-1' }), NotFoundException);
    assert.equal(repo.claimCalls.length, 0);
  });

  it('throws NotFoundException when lead belongs to another user', async () => {
    const repo = stubRepo({ findOwned: async () => null });
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    await assert.rejects(() => useCase.enrich({ leadId: 'lead-1', userId: 'other-user' }), NotFoundException);
    assert.equal(repo.claimCalls.length, 0);
  });

  it('throws ConflictException when claim fails (fresh IN_PROGRESS)', async () => {
    const repo = stubRepo({ claimForEnrichment: async () => false });
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    await assert.rejects(() => useCase.enrich({ leadId: 'lead-1', userId: 'user-1' }), ConflictException);
    assert.equal(repo.persistCalls.length, 0);
  });

  it('throws NotFoundException if updateEnrichmentResult returns null (deleted after claim)', async () => {
    const repo = stubRepo({ updateEnrichmentResult: async () => null });
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    await assert.rejects(() => useCase.enrich({ leadId: 'lead-1', userId: 'user-1' }), NotFoundException);
  });

  it('handles no website gracefully (social-only enrichment)', async () => {
    const repo = stubRepo({
      findOwned: async () => leadSnapshot({ website: null }),
    });
    const socialEngine = new EnrichmentEngine(
      {
        providerId: 'http-website-enrichment',
        enrich: async () => {
          throw new Error('should not be called');
        },
      } as WebsiteEnrichmentPort,
      {
        providerId: 'http-social-discovery',
        discover: async () => ({
          profiles: [
            { platform: 'facebook', handle: 'abuqir', profileUrl: 'https://facebook.com/abuqir', confidence: 0.8 },
          ],
          discoveredAt: new Date(),
          provider: 'http-social-discovery',
        }),
      } as SocialDiscoveryPort,
    );
    const useCase = new EnrichLeadUseCase(repo, socialEngine);

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.equal(result.lead.enrichmentStatus, 'ENRICHED');
    assert.ok(result.lead.enrichmentSnapshot);
    assert.equal(repo.persistCalls[0]?.status, 'ENRICHED');
  });

  it('returns ENRICHMENT_FAILED on total provider failure', async () => {
    const repo = stubRepo();
    const useCase = new EnrichLeadUseCase(repo, failedEngine());

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.equal(result.lead.enrichmentStatus, 'ENRICHMENT_FAILED');
    assert.ok(result.lead.enrichmentSnapshot);
    assert.ok(result.lead.enrichmentSnapshot?.errors);
    assert.equal(result.lead.enrichmentSnapshot?.errors?.[0]?.type, 'website');
    assert.equal(repo.persistCalls[0]?.status, 'ENRICHMENT_FAILED');
  });

  it('returns SKIPPED when no website and social port disabled', async () => {
    const repo = stubRepo({
      findOwned: async () => leadSnapshot({ website: null }),
    });
    const useCase = new EnrichLeadUseCase(repo, skippedEngine());

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.equal(result.lead.enrichmentStatus, 'SKIPPED');
    assert.equal(repo.persistCalls[0]?.status, 'SKIPPED');
  });

  it('does not overwrite unrelated lead fields', async () => {
    const repo = stubRepo();
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.equal(result.lead.companyName, 'مطعم أبو قير للمأكولات البحرية');
    assert.equal(result.lead.status, 'NEW');
    assert.equal(result.lead.phone, '+20 3 540 2233');
    assert.equal(result.lead.website, 'https://abuqir-seafood.example.com');
  });

  it('passes skipWebsite and skipSocial options to engine', async () => {
    const repo = stubRepo();
    let capturedOptions: { skipWebsite?: boolean; skipSocial?: boolean } | undefined;
    const engine = stubEngine();
    const origEnrich = engine.enrichSingleTarget.bind(engine);
    engine.enrichSingleTarget = async (target, options) => {
      capturedOptions = options;
      return origEnrich(target, options);
    };

    const useCase = new EnrichLeadUseCase(repo, engine);
    await useCase.enrich({ leadId: 'lead-1', userId: 'user-1', skipWebsite: true, skipSocial: true });

    assert.deepEqual(capturedOptions, { skipWebsite: true, skipSocial: true });
  });

  it('returns enrich result with enrichedAt timestamp set', async () => {
    const repo = stubRepo();
    const useCase = new EnrichLeadUseCase(repo, stubEngine());

    const result = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });

    assert.ok(result.lead.enrichedAt);
    assert.ok(new Date(result.lead.enrichedAt).getTime() > 0);
  });
});
