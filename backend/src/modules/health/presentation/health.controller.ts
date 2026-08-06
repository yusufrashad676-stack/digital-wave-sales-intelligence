import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from '../application/health.service.js';
import type { HealthReport } from '../domain/health.types.js';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
