import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  CompleteSearchExecutionInput,
  CreateSearchExecutionInput,
  FailSearchExecutionInput,
  SearchExecutionRepository,
  SearchExecutionSnapshot,
} from '../../domain/ports/search-execution.repository.js';

@Injectable()
export class PrismaSearchExecutionRepository implements SearchExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createExecution(input: CreateSearchExecutionInput): Promise<SearchExecutionSnapshot> {
    const row = await this.prisma.client.searchExecution.create({
      data: {
        jobId: input.jobId,
        importSourceId: input.importSourceId,
        attempt: input.attempt,
        trigger: input.trigger,
        status: input.status,
        providerRequest: input.providerRequest as unknown as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        startedAt: input.startedAt,
      },
      select: { id: true },
    });
    return row;
  }

  async markExecutionCompleted(id: string, input: CompleteSearchExecutionInput): Promise<void> {
    await this.prisma.client.searchExecution.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        finishedAt: input.finishedAt,
        metrics: input.metrics as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async markExecutionFailed(id: string, input: FailSearchExecutionInput): Promise<void> {
    await this.prisma.client.searchExecution.update({
      where: { id },
      data: {
        status: 'FAILED',
        finishedAt: input.finishedAt,
        error: input.error,
      },
    });
  }
}
