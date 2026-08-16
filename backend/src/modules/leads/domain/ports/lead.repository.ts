import type { LeadSnapshot, LeadStatus, SaveLeadInput } from '../entities/lead.entity.js';

export const LeadRepository = Symbol('LeadRepository');

export interface LeadRepository {
  save(userId: string, input: SaveLeadInput): Promise<LeadSnapshot>;
  listByUser(userId: string): Promise<LeadSnapshot[]>;
  findOwned(userId: string, leadId: string): Promise<LeadSnapshot | null>;
  update(
    userId: string,
    leadId: string,
    patch: { status?: LeadStatus; notes?: string | null },
  ): Promise<LeadSnapshot | null>;
  remove(userId: string, leadId: string): Promise<boolean>;
}
