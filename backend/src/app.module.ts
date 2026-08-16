import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './database/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthGuard } from './modules/auth/presentation/guards/auth.guard.js';
import { RolesGuard } from './modules/auth/presentation/guards/roles.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { SearchModule } from './modules/search/search.module.js';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.getOrThrow<number>('throttle.ttlSeconds') * 1000,
          limit: config.getOrThrow<number>('throttle.limit'),
        },
        {
          name: 'auth',
          ttl: config.getOrThrow<number>('auth.throttle.ttlSeconds') * 1000,
          limit: config.getOrThrow<number>('auth.throttle.limit'),
        },
      ],
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    HealthModule,
    SearchModule,
    LeadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
