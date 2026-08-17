import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import type {
  EnrichmentExecutionRow,
  EnrichmentRepository,
  EnrichmentResultRow,
} from '../../domain/ports/enrichment.repository.js';

@Injectable()
export class PrismaEnrichmentRepository implements EnrichmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findResultsByExecutionId(executionId: string): Promise<EnrichmentResultRow[]> {
    const rows = await this.prisma.client.searchResult.findMany({
      where: { executionId, deletedAt: null },
      select: {
        id: true,
        executionId: true,
        providerId: true,
        providerRecordId: true,
        companyName: true,
        websiteDomain: true,
        enrichmentStatus: true,
        enrichmentSnapshot: true,
      },
      orderBy: { ordering: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      executionId: row.executionId,
      providerId: row.providerId,
      providerRecordId: row.providerRecordId,
      companyName: row.companyName,
      websiteDomain: row.websiteDomain,
      enrichmentStatus: row.enrichmentStatus,
      enrichmentSnapshot: row.enrichmentSnapshot as EnrichmentSnapshot | null,
    }));
  }

  async findExecutionById(executionId: string): Promise<EnrichmentExecutionRow | null> {
    const row = await this.prisma.client.searchExecution.findUnique({
      where: { id: executionId },
      select: {
        id: true,
        jobId: true,
        status: true,
        createdById: true,
        metrics: true,
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      createdById: row.createdById,
      metrics: row.metrics as Record<string, unknown> | null,
    };
  }

  async updateEnrichmentStatus(
    searchResultId: string,
    status: string,
    snapshot: EnrichmentSnapshot | null,
  ): Promise<void> {
    await this.prisma.client.searchResult.update({
      where: { id: searchResultId },
      data: {
        enrichmentStatus: status as EnrichmentStatus,
        enrichmentSnapshot: snapshot === null ? Prisma.JsonNull : (snapshot as unknown as Prisma.InputJsonValue),
        enrichedAt: snapshot ? new Date() : undefined,
      },
    });
  }

  async resetStaleInProgress(executionId: string): Promise<number> {
    const result = await this.prisma.client.searchResult.updateMany({
      where: {
        executionId,
        enrichmentStatus: 'IN_PROGRESS',
        deletedAt: null,
      },
      data: {
        enrichmentStatus: 'PENDING',
      },
    });

    return result.count;
  }

  async countByEnrichmentStatus(executionId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.client.searchResult.groupBy({
      by: ['enrichmentStatus'],
      where: { executionId, deletedAt: null },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.enrichmentStatus] = row._count.id;
    }
    return counts;
  }

  async updateExecutionMetrics(executionId: string, metrics: Record<string, unknown>): Promise<void> {
    const execution = await this.prisma.client.searchExecution.findUnique({
      where: { id: executionId },
      select: { metrics: true },
    });

    const existing = (execution?.metrics as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...metrics };

    await this.prisma.client.searchExecution.update({
      where: { id: executionId },
      data: {
        metrics: merged as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async acquireEnrichmentLock(_executionId: string, _userId: string): Promise<boolean> {
    // D4 feature — no-op for D2
    return true;
  }

  async releaseEnrichmentLock(_executionId: string, _userId: string): Promise<void> {
    // D4 feature — no-op for D2
  }
}

// Re-export the Prisma enum type for local use
type EnrichmentStatus = 'PENDING' | 'IN_PROGRESS' | 'ENRICHED' | 'PARTIALLY_ENRICHED' | 'ENRICHMENT_FAILED' | 'SKIPPED';
