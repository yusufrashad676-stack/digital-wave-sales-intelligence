import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  CreateSearchJobInput,
  SearchJobHistoryItem,
  SearchJobRepository,
  SearchJobSnapshot,
} from '../../domain/ports/search-job.repository.js';

@Injectable()
export class PrismaSearchJobRepository implements SearchJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(input: CreateSearchJobInput): Promise<SearchJobSnapshot> {
    const row = await this.prisma.client.searchJob.create({
      data: {
        query: input.query,
        filters: input.filters as unknown as Prisma.InputJsonValue,
        status: input.status,
        userId: input.userId,
      },
      select: { id: true },
    });
    return row;
  }

  async markJobCompleted(id: string): Promise<void> {
    await this.prisma.client.searchJob.update({ where: { id }, data: { status: 'COMPLETED' } });
  }

  async markJobFailed(id: string): Promise<void> {
    await this.prisma.client.searchJob.update({ where: { id }, data: { status: 'FAILED' } });
  }

  async findRecentByUser(userId: string, limit: number): Promise<SearchJobHistoryItem[]> {
    const rows = await this.prisma.client.searchJob.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        query: true,
        filters: true,
        status: true,
        createdAt: true,
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            finishedAt: true,
            _count: { select: { results: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      executionId: row.executions[0]?.id ?? null,
      query: row.query,
      filters: row.filters as unknown as SearchJobHistoryItem['filters'],
      status: row.status,
      resultCount: row.executions[0]?._count.results ?? 0,
      executedAt: row.executions[0]?.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
