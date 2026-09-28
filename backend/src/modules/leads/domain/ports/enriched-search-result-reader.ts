import type { LeadEnrichmentSnapshot } from '../entities/lead.entity.js';

export interface EnrichedSearchResultRecord {
  id: string;
  providerRecordId: string;
  enrichmentStatus: string;
  enrichmentSnapshot: LeadEnrichmentSnapshot | null;
  enrichedAt: Date | null;
}

export const EnrichedSearchResultReader = Symbol('EnrichedSearchResultReader');

/**
 * Reads a search result for lead persistence, enforcing the E1 ownership model:
 * the result is only visible when its execution's SearchJob belongs to the user
 * (SearchExecution → SearchJob.userId) and neither result nor job is soft-deleted.
 */
export interface EnrichedSearchResultReader {
  findByIdForUser(searchResultId: string, userId: string): Promise<EnrichedSearchResultRecord | null>;
}
