import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { CompanyGapAnalysisService } from './application/services/company-gap-analysis.service.js';
import { CompanyIntelligenceService } from './application/services/company-intelligence.service.js';
import { EnrichmentEngine } from './application/services/enrichment-engine.js';
import { CanonicalPromotionService } from './application/services/canonical-promotion.service.js';
import { EnrichSearchResultsUseCase } from './application/use-cases/enrich-search-results.usecase.js';
import { GetCompanyGapAnalysisUseCase } from './application/use-cases/get-company-gap-analysis.usecase.js';
import { GetCompanyIntelligenceUseCase } from './application/use-cases/get-company-intelligence.usecase.js';
import { GetExecutionUseCase } from './application/use-cases/get-execution.usecase.js';
import { GetExecutionResultsUseCase } from './application/use-cases/get-execution-results.usecase.js';
import { GetSearchHistoryUseCase } from './application/use-cases/get-search-history.usecase.js';
import { RunDiscoveryUseCase } from './application/use-cases/run-discovery.usecase.js';
import { SearchCompaniesUseCase } from './application/use-cases/search-companies.usecase.js';
import { ENRICHMENT_ENABLED } from './domain/tokens.js';
import { CanonicalPromotionRepository } from './domain/ports/canonical-promotion.repository.js';
import { CompanyEvidenceRepository } from './domain/ports/company-evidence.repository.js';
import { EnrichmentRepository } from './domain/ports/enrichment.repository.js';
import { ImportSourceRepository } from './domain/ports/import-source.repository.js';
import { SearchExecutionRepository } from './domain/ports/search-execution.repository.js';
import { SearchJobRepository } from './domain/ports/search-job.repository.js';
import { SearchPersistenceRepository } from './domain/ports/search-persistence.repository.js';
import { SearchProviderPort } from './domain/ports/search-provider.port.js';
import { SocialDiscoveryPort } from './domain/ports/social-discovery.port.js';
import { SocialVerificationPort } from './domain/ports/social-verification.port.js';
import { WebsiteEnrichmentPort } from './domain/ports/website-enrichment.port.js';
import { PrismaCanonicalPromotionRepository } from './infrastructure/persistence/prisma-canonical-promotion.repository.js';
import { PrismaCompanyEvidenceRepository } from './infrastructure/persistence/prisma-company-evidence.repository.js';
import { PrismaEnrichmentRepository } from './infrastructure/persistence/prisma-enrichment.repository.js';
import { PrismaImportSourceRepository } from './infrastructure/persistence/prisma-import-source.repository.js';
import { PrismaSearchExecutionRepository } from './infrastructure/persistence/prisma-search-execution.repository.js';
import { PrismaSearchJobRepository } from './infrastructure/persistence/prisma-search-job.repository.js';
import { PrismaSearchPersistenceRepository } from './infrastructure/persistence/prisma-search-persistence.repository.js';
import {
  createWebsiteEnrichmentProvider,
  createSocialDiscoveryProvider,
  createSocialVerificationProvider,
} from './infrastructure/providers/enrichment-provider.factory.js';
import { createSearchProvider } from './infrastructure/providers/search-provider.factory.js';
import { EnrichController } from './presentation/controllers/enrich.controller.js';
import { ExecutionResultsController } from './presentation/controllers/execution-results.controller.js';
import { RunController } from './presentation/controllers/run.controller.js';
import { SearchController } from './presentation/controllers/search.controller.js';

@Module({
  controllers: [SearchController, RunController, EnrichController, ExecutionResultsController],
  providers: [
    {
      provide: SearchProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSearchProvider(
          config.getOrThrow<AppConfig['search']>('search'),
          config.getOrThrow<AppConfig['app']['nodeEnv']>('app.nodeEnv'),
        ),
    },
    {
      provide: WebsiteEnrichmentPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWebsiteEnrichmentProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    {
      provide: SocialDiscoveryPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSocialDiscoveryProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    {
      provide: SocialVerificationPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSocialVerificationProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    {
      provide: ENRICHMENT_ENABLED,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.getOrThrow<AppConfig['enrichment']>('enrichment').enabled,
    },
    { provide: ImportSourceRepository, useClass: PrismaImportSourceRepository },
    { provide: SearchJobRepository, useClass: PrismaSearchJobRepository },
    { provide: SearchExecutionRepository, useClass: PrismaSearchExecutionRepository },
    { provide: SearchPersistenceRepository, useClass: PrismaSearchPersistenceRepository },
    { provide: EnrichmentRepository, useClass: PrismaEnrichmentRepository },
    { provide: CanonicalPromotionRepository, useClass: PrismaCanonicalPromotionRepository },
    { provide: CompanyEvidenceRepository, useClass: PrismaCompanyEvidenceRepository },
    EnrichmentEngine,
    CanonicalPromotionService,
    CompanyIntelligenceService,
    CompanyGapAnalysisService,
    SearchCompaniesUseCase,
    RunDiscoveryUseCase,
    GetSearchHistoryUseCase,
    EnrichSearchResultsUseCase,
    GetExecutionUseCase,
    GetExecutionResultsUseCase,
    GetCompanyIntelligenceUseCase,
    GetCompanyGapAnalysisUseCase,
  ],
  exports: [EnrichmentEngine, ENRICHMENT_ENABLED, GetCompanyIntelligenceUseCase, GetCompanyGapAnalysisUseCase],
})
export class SearchModule {}
