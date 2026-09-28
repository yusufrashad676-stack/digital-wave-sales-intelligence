import type {
  LeadEnrichmentCopy,
  LeadEnrichmentSnapshot,
  LeadSnapshot,
  LeadStatus,
  SaveLeadInput,
} from '../entities/lead.entity.js';

export const LeadRepository = Symbol('LeadRepository');

export interface LeadRepository {
  save(userId: string, input: SaveLeadInput, enrichment?: LeadEnrichmentCopy | null): Promise<LeadSnapshot>;
  listByUser(userId: string): Promise<LeadSnapshot[]>;
  findOwned(userId: string, leadId: string): Promise<LeadSnapshot | null>;
  update(
    userId: string,
    leadId: string,
    patch: { status?: LeadStatus; notes?: string | null },
  ): Promise<LeadSnapshot | null>;
  remove(userId: string, leadId: string): Promise<boolean>;
  claimForEnrichment(userId: string, leadId: string, staleThresholdMs: number): Promise<boolean>;
  updateEnrichmentResult(
    userId: string,
    leadId: string,
    status: string,
    snapshot: LeadEnrichmentSnapshot | null,
    enrichedAt: Date,
  ): Promise<LeadSnapshot | null>;
}
