import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { ValidationException } from '../../../../common/exceptions/validation.exception.js';
import type { LeadEnrichmentCopy, LeadSnapshot, SaveLeadInput } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';
import type { EnrichedSearchResultRecord } from '../../domain/ports/enriched-search-result-reader.js';
import { EnrichedSearchResultReader } from '../../domain/ports/enriched-search-result-reader.js';

function toEnrichmentCopy(source: EnrichedSearchResultRecord): LeadEnrichmentCopy {
  if (source.enrichmentStatus === 'IN_PROGRESS') {
    // Transient state at save time must not stick to a lead.
    return { enrichmentStatus: 'PENDING', enrichmentSnapshot: null, enrichedAt: null };
  }
  return {
    enrichmentStatus: source.enrichmentStatus,
    enrichmentSnapshot: source.enrichmentSnapshot,
    enrichedAt: source.enrichedAt,
  };
}

@Injectable()
export class SaveLeadUseCase {
  constructor(
    @Inject(LeadRepository) private readonly repository: LeadRepository,
    @Inject(EnrichedSearchResultReader) private readonly searchResults: EnrichedSearchResultReader,
  ) {}

  async save(userId: string, input: SaveLeadInput): Promise<LeadSnapshot> {
    let enrichment: LeadEnrichmentCopy | null = null;

    if (input.searchResultId !== undefined) {
      const source = await this.searchResults.findByIdForUser(input.searchResultId, userId);
      if (source === null) {
        throw new NotFoundException(`Search result ${input.searchResultId} not found`);
      }
      if (source.providerRecordId !== input.providerRecordId) {
        throw new ValidationException([
          { field: 'searchResultId', code: 'MISMATCH', message: 'searchResultId does not match providerRecordId' },
        ]);
      }
      enrichment = toEnrichmentCopy(source);
    }

    return this.repository.save(userId, input, enrichment);
  }
}
