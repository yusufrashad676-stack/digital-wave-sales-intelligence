import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { GetSearchHistoryUseCase } from './application/use-cases/get-search-history.usecase.js';
import { RunDiscoveryUseCase } from './application/use-cases/run-discovery.usecase.js';
import { SearchCompaniesUseCase } from './application/use-cases/search-companies.usecase.js';
import { ImportSourceRepository } from './domain/ports/import-source.repository.js';
import { SearchExecutionRepository } from './domain/ports/search-execution.repository.js';
import { SearchJobRepository } from './domain/ports/search-job.repository.js';
import { SearchPersistenceRepository } from './domain/ports/search-persistence.repository.js';
import { SearchProviderPort } from './domain/ports/search-provider.port.js';
import { PrismaImportSourceRepository } from './infrastructure/persistence/prisma-import-source.repository.js';
import { PrismaSearchExecutionRepository } from './infrastructure/persistence/prisma-search-execution.repository.js';
import { PrismaSearchJobRepository } from './infrastructure/persistence/prisma-search-job.repository.js';
import { PrismaSearchPersistenceRepository } from './infrastructure/persistence/prisma-search-persistence.repository.js';
import { createSearchProvider } from './infrastructure/providers/search-provider.factory.js';
import { RunController } from './presentation/controllers/run.controller.js';
import { SearchController } from './presentation/controllers/search.controller.js';

@Module({
  controllers: [SearchController, RunController],
  providers: [
    {
      provide: SearchProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createSearchProvider(config.getOrThrow<AppConfig['search']>('search')),
    },
    { provide: ImportSourceRepository, useClass: PrismaImportSourceRepository },
    { provide: SearchJobRepository, useClass: PrismaSearchJobRepository },
    { provide: SearchExecutionRepository, useClass: PrismaSearchExecutionRepository },
    { provide: SearchPersistenceRepository, useClass: PrismaSearchPersistenceRepository },
    SearchCompaniesUseCase,
    RunDiscoveryUseCase,
    GetSearchHistoryUseCase,
  ],
})
export class SearchModule {}
