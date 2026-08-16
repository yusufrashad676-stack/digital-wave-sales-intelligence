import { Injectable } from '@nestjs/common';
import type { Lead, Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type { LeadSnapshot, LeadStatus, SaveLeadInput } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

@Injectable()
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, input: SaveLeadInput): Promise<LeadSnapshot> {
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
            createdById: userId,
            updatedById: userId,
          },
        });
      }
      if (existing.deletedAt === null) {
        // Idempotent re-save: return the active lead untouched.
        return tx.lead.findUniqueOrThrow({ where: { id: existing.id } });
      }
      // Re-save after removal = restore (soft-delete semantics, ADR-005).
      return tx.lead.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          status: 'NEW',
          notes: null,
          providerId: input.providerId,
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
    retrievedAt: row.retrievedAt.toISOString(),
    savedAt: row.savedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
