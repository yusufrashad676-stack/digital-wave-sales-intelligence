import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator.js';
import { HealthService } from '../application/health.service.js';
import type { HealthReport } from '../domain/health.types.js';

@Controller('health')
@Public()
@SkipThrottle({ default: true, auth: true })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
