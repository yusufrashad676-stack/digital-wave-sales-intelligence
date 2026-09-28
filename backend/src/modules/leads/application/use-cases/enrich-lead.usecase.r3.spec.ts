import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnrichLeadUseCase } from './enrich-lead.usecase.js';
import type { LeadRepository } from '../../domain/ports/lead.repository.js';
import { EnrichmentEngine } from '../../../search/application/services/enrichment-engine.js';
import type { WebsiteEnrichmentPort } from '../../../search/domain/ports/website-enrichment.port.js';

function stubRepo(): LeadRepository {
  return {
    findOwned: async () => ({
      id: 'lead-1',
      companyName: 'Test Co',
      website: 'test.com',
      enrichmentStatus: null,
      enrichmentSnapshot: null,
    }),
    claimForEnrichment: async () => true,
    updateEnrichmentResult: async (_userId, _leadId, status, snapshot, enrichedAt) => ({
      id: 'lead-1',
      companyName: 'Test Co',
      website: 'test.com',
      enrichmentStatus: status,
      enrichmentSnapshot: snapshot,
      enrichedAt,
    }),
  } as unknown as LeadRepository;
}

function stubEngine(): EnrichmentEngine {
  const website: WebsiteEnrichmentPort = {
    providerId: 'http-website-enrichment',
    enrich: async (req) => ({
      domain: req.domain,
      data: {
        title: 'Test Co',
        description: null,
        techHints: [],
        socialLinks: [],
        fetchedAt: new Date().toISOString(),
        provider: 'http-website-enrichment',
      },
    }),
  };
  return new EnrichmentEngine(website, undefined, undefined);
}

describe('EnrichLeadUseCase — R3 feature gate', () => {
  it('K: ENRICHMENT_ENABLED=false rejects enrichment without touching the engine', async () => {
    const engine = stubEngine();
    const useCase = new EnrichLeadUseCase(stubRepo(), engine, false);

    await assert.rejects(
      () => useCase.enrich({ leadId: 'lead-1', userId: 'user-1' }),
      (err: Error) => err.name === 'BusinessRuleException' && err.message.includes('ENRICHMENT_ENABLED'),
    );
  });

  it('L: ENRICHMENT_ENABLED=true still enriches normally', async () => {
    const useCase = new EnrichLeadUseCase(stubRepo(), stubEngine(), true);
    const outcome = await useCase.enrich({ leadId: 'lead-1', userId: 'user-1' });
    assert.ok(outcome.lead.enrichmentStatus);
  });
});
