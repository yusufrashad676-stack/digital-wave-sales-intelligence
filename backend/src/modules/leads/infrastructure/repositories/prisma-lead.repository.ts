import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import type { Lead } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  LeadEnrichmentCopy,
  LeadEnrichmentSnapshot,
  LeadSnapshot,
  LeadStatus,
  SaveLeadInput,
} from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

function toSnapshotValue(snapshot: LeadEnrichmentSnapshot | null | undefined) {
  return snapshot === null || snapshot === undefined ? Prisma.JsonNull : (snapshot as Prisma.InputJsonValue);
}

function toStatusValue(status: string | undefined): Lead['enrichmentStatus'] {
  return (status ?? 'PENDING') as Lead['enrichmentStatus'];
}

@Injectable()
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, input: SaveLeadInput, enrichment?: LeadEnrichmentCopy | null): Promise<LeadSnapshot> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { userId, providerRecordId: input.providerRecordId },
        select: { id: true, deletedAt: true },
      });
      if (existing === null) {
        return tx.lead.create({
          data: {
            userId,
            providerId: input.providerId,
            providerRecordId: input.providerRecordId,
            companyName: input.companyName,
            category: input.category,
            formattedAddress: input.address,
            area: input.area,
            phone: input.phone,
            email: input.email,
            websiteDomain: input.website,
            rating: input.rating,
            ratingCount: input.ratingCount,
            verificationStatus: input.verificationStatus ?? 'UNKNOWN',
            sourceUrl: input.sourceUrl,
            retrievedAt: new Date(input.retrievedAt),
            enrichmentStatus: toStatusValue(enrichment?.enrichmentStatus),
            enrichmentSnapshot: toSnapshotValue(enrichment?.enrichmentSnapshot),
            enrichedAt: enrichment?.enrichedAt ?? undefined,
            createdById: userId,
            updatedById: userId,
          },
        });
      }
      if (existing.deletedAt === null) {
        if (enrichment === null || enrichment === undefined) {
          // Idempotent re-save: return the active lead untouched.
          return tx.lead.findUniqueOrThrow({ where: { id: existing.id } });
        }
        // Idempotent re-save with an enrichment source: refresh enrichment columns only.
        return tx.lead.update({
          where: { id: existing.id },
          data: {
            enrichmentStatus: enrichment.enrichmentStatus as Lead['enrichmentStatus'],
            enrichmentSnapshot: toSnapshotValue(enrichment.enrichmentSnapshot),
            enrichedAt: enrichment.enrichedAt ?? undefined,
            updatedById: userId,
          },
        });
      }
      // Re-save after removal = restore (soft-delete semantics, ADR-005).
      return tx.lead.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          status: 'NEW',
          notes: null,
          providerId: input.providerId,
          providerRecordId: input.providerRecordId,
          companyName: input.companyName,
          category: input.category,
          formattedAddress: input.address,
          area: input.area,
          phone: input.phone,
          email: input.email,
          websiteDomain: input.website,
          rating: input.rating,
          ratingCount: input.ratingCount,
          verificationStatus: input.verificationStatus ?? 'UNKNOWN',
          sourceUrl: input.sourceUrl,
          retrievedAt: new Date(input.retrievedAt),
          enrichmentStatus: toStatusValue(enrichment?.enrichmentStatus),
          enrichmentSnapshot: toSnapshotValue(enrichment?.enrichmentSnapshot),
          enrichedAt: enrichment?.enrichedAt ?? undefined,
          savedAt: new Date(),
          updatedById: userId,
        },
      });
    });
    return mapLead(row);
  }

  async listByUser(userId: string): Promise<LeadSnapshot[]> {
    const rows = await this.prisma.client.lead.findMany({
      where: { userId, deletedAt: null },
      orderBy: { savedAt: 'desc' },
    });
    return rows.map(mapLead);
  }

  async findOwned(userId: string, leadId: string): Promise<LeadSnapshot | null> {
    const row = await this.prisma.client.lead.findFirst({
      where: { id: leadId, userId, deletedAt: null },
    });
    return row === null ? null : mapLead(row);
  }

  async update(
    userId: string,
    leadId: string,
    patch: { status?: LeadStatus; notes?: string | null },
  ): Promise<LeadSnapshot | null> {
    const data: Prisma.LeadUncheckedUpdateInput = { updatedById: userId };
    if (patch.status !== undefined) {
      data.status = patch.status;
    }
    if ('notes' in patch) {
      data.notes = patch.notes;
    }
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { id: leadId, userId, deletedAt: null },
        select: { id: true },
      });
      if (existing === null) {
        return null;
      }
      const row = await tx.lead.update({ where: { id: existing.id }, data });
      return mapLead(row);
    });
  }

  async remove(userId: string, leadId: string): Promise<boolean> {
    const result = await this.prisma.client.lead.updateMany({
      where: { id: leadId, userId, deletedAt: null },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    return result.count > 0;
  }

  async claimForEnrichment(userId: string, leadId: string, staleThresholdMs: number): Promise<boolean> {
    const staleThreshold = new Date(Date.now() - staleThresholdMs);
    const result = await this.prisma.client.lead.updateMany({
      where: {
        id: leadId,
        userId,
        deletedAt: null,
        OR: [
          { enrichmentStatus: { not: 'IN_PROGRESS' } },
          { enrichmentStatus: 'IN_PROGRESS', updatedAt: { lt: staleThreshold } },
        ],
      },
      data: { enrichmentStatus: 'IN_PROGRESS', updatedById: userId },
    });
    return result.count > 0;
  }

  async updateEnrichmentResult(
    userId: string,
    leadId: string,
    status: string,
    snapshot: LeadEnrichmentSnapshot | null,
    enrichedAt: Date,
  ): Promise<LeadSnapshot | null> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { id: leadId, userId, deletedAt: null },
        select: { id: true },
      });
      if (existing === null) return null;
      return tx.lead.update({
        where: { id: existing.id },
        data: {
          enrichmentStatus: status as Lead['enrichmentStatus'],
          enrichmentSnapshot: toSnapshotValue(snapshot),
          enrichedAt,
          updatedById: userId,
        },
      });
    });
    return row === null ? null : mapLead(row);
  }
}

function mapLead(row: Lead): LeadSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as LeadStatus,
    notes: row.notes,
    providerId: row.providerId,
    providerRecordId: row.providerRecordId,
    companyName: row.companyName,
    category: row.category,
    area: row.area,
    address: row.formattedAddress,
    phone: row.phone,
    email: row.email,
    website: row.websiteDomain,
    rating: row.rating,
    ratingCount: row.ratingCount,
    verificationStatus: row.verificationStatus,
    sourceUrl: row.sourceUrl,
    enrichmentStatus: row.enrichmentStatus,
    enrichmentSnapshot: (row.enrichmentSnapshot ?? null) as LeadSnapshot['enrichmentSnapshot'],
    enrichedAt: row.enrichedAt === null ? null : row.enrichedAt.toISOString(),
    retrievedAt: row.retrievedAt.toISOString(),
    savedAt: row.savedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
