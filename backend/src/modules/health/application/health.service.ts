import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service.js';
import { ServiceUnavailableException } from '../../../common/exceptions/service-unavailable.exception.js';
import type { HealthReport, ServiceStatus } from '../domain/health.types.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const database = await this.checkDatabase();
    if (database !== 'up') {
      throw new ServiceUnavailableException('DATABASE_UNAVAILABLE', 'Database is unavailable');
    }
    return {
      status: 'ok',
      services: { database },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.warn('Database health check failed', error instanceof Error ? error.stack : String(error));
      return 'down';
    }
  }
}
