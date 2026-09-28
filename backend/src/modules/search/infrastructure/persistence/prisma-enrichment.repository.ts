import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import type {
  EnrichmentRepository,
  EnrichmentResultRow,
  ExecutionDetailRow,
  ExecutionResultRow,
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
        companyId: true,
        companyName: true,
        phone: true,
        email: true,
        websiteDomain: true,
        sourceUrl: true,
        retrievedAt: true,
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
      companyId: row.companyId,
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      websiteDomain: row.websiteDomain,
      sourceUrl: row.sourceUrl,
      retrievedAt: row.retrievedAt,
      enrichmentStatus: row.enrichmentStatus,
      enrichmentSnapshot: row.enrichmentSnapshot as EnrichmentSnapshot | null,
    }));
  }

  async findExecutionDetail(executionId: string): Promise<ExecutionDetailRow | null> {
    const row = await this.prisma.client.searchExecution.findUnique({
      where: { id: executionId },
      select: {
        id: true,
        jobId: true,
        status: true,
        createdAt: true,
        finishedAt: true,
        metrics: true,
        job: {
          select: { query: true, filters: true, userId: true, deletedAt: true },
        },
      },
    });

    if (!row || !row.job || row.job.deletedAt !== null) return null;

    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      query: row.job.query,
      filters: (row.job.filters as Record<string, unknown> | null) ?? null,
      jobUserId: row.job.userId,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      metrics: (row.metrics as Record<string, unknown> | null) ?? null,
    };
  }

  async findFullResultsByExecutionId(executionId: string): Promise<ExecutionResultRow[]> {
    const rows = await this.prisma.client.searchResult.findMany({
      where: { executionId, deletedAt: null },
      select: {
        id: true,
        executionId: true,
        providerId: true,
        providerRecordId: true,
        companyName: true,
        category: true,
        formattedAddress: true,
        area: true,
        phone: true,
        email: true,
        websiteDomain: true,
        rating: true,
        ratingCount: true,
        sourceUrl: true,
        verificationStatus: true,
        ordering: true,
        retrievedAt: true,
        enrichmentStatus: true,
        enrichmentSnapshot: true,
        enrichedAt: true,
      },
      orderBy: { ordering: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      executionId: row.executionId,
      providerId: row.providerId,
      providerRecordId: row.providerRecordId,
      companyName: row.companyName,
      category: row.category,
      formattedAddress: row.formattedAddress,
      area: row.area,
      phone: row.phone,
      email: row.email,
      websiteDomain: row.websiteDomain,
      rating: row.rating,
      ratingCount: row.ratingCount,
      sourceUrl: row.sourceUrl,
      verificationStatus: row.verificationStatus,
      ordering: row.ordering,
      retrievedAt: row.retrievedAt,
      enrichmentStatus: row.enrichmentStatus,
      enrichmentSnapshot: row.enrichmentSnapshot as EnrichmentSnapshot | null,
      enrichedAt: row.enrichedAt,
    }));
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

type EnrichmentStatus = 'PENDING' | 'IN_PROGRESS' | 'ENRICHED' | 'PARTIALLY_ENRICHED' | 'ENRICHMENT_FAILED' | 'SKIPPED';
