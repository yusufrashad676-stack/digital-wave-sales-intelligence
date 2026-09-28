import { Inject, Injectable } from '@nestjs/common';
import { ConflictException } from '../../../../common/exceptions/conflict.exception.js';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadSnapshot } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';
import { EnrichmentEngine } from '../../../search/application/services/enrichment-engine.js';

export const STALE_IN_PROGRESS_MS = 10 * 60 * 1000; // 10 minutes

export interface EnrichLeadInput {
  leadId: string;
  userId: string;
  skipWebsite?: boolean;
  skipSocial?: boolean;
}

export interface EnrichLeadResult {
  lead: LeadSnapshot;
  durationMs: number;
}

@Injectable()
export class EnrichLeadUseCase {
  constructor(
    @Inject(LeadRepository) private readonly leadRepo: LeadRepository,
    private readonly engine: EnrichmentEngine,
  ) {}

  async enrich(input: EnrichLeadInput): Promise<EnrichLeadResult> {
    const startedAt = new Date();
    const { leadId, userId, skipWebsite, skipSocial } = input;

    // 1. Load lead and verify ownership
    const lead = await this.leadRepo.findOwned(userId, leadId);
    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    // 2. Determine enrichment target from trusted server-side data
    const target = {
      websiteDomain: lead.website,
      companyName: lead.companyName,
    };

    // 3. Atomic conditional claim (PENDING/etc → IN_PROGRESS)
    const claimed = await this.leadRepo.claimForEnrichment(userId, leadId, STALE_IN_PROGRESS_MS);
    if (!claimed) {
      throw new ConflictException('Enrichment already in progress');
    }

    // 4. Run enrichment engine
    const engineResult = await this.engine.enrichSingleTarget(target, { skipWebsite, skipSocial });

    // 5. Persist result
    const enrichedAt = new Date();
    const updated = await this.leadRepo.updateEnrichmentResult(
      userId,
      leadId,
      engineResult.status,
      engineResult.snapshot,
      enrichedAt,
    );
    if (!updated) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    const durationMs = Date.now() - startedAt.getTime();
    return { lead: updated, durationMs };
  }
}
