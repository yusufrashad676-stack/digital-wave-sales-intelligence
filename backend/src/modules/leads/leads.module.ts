import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module.js';
import { EnrichLeadUseCase } from './application/use-cases/enrich-lead.usecase.js';
import { GetSavedLeadUseCase } from './application/use-cases/get-saved-lead.usecase.js';
import { ListSavedLeadsUseCase } from './application/use-cases/list-saved-leads.usecase.js';
import { RemoveSavedLeadUseCase } from './application/use-cases/remove-saved-lead.usecase.js';
import { SaveLeadUseCase } from './application/use-cases/save-lead.usecase.js';
import { UpdateSavedLeadUseCase } from './application/use-cases/update-saved-lead.usecase.js';
import { EnrichedSearchResultReader } from './domain/ports/enriched-search-result-reader.js';
import { LeadRepository } from './domain/ports/lead.repository.js';
import { PrismaEnrichedSearchResultReader } from './infrastructure/repositories/prisma-enriched-search-result-reader.js';
import { PrismaLeadRepository } from './infrastructure/repositories/prisma-lead.repository.js';
import { LeadsController } from './presentation/controllers/leads.controller.js';

@Module({
  imports: [SearchModule],
  controllers: [LeadsController],
  providers: [
    { provide: LeadRepository, useClass: PrismaLeadRepository },
    { provide: EnrichedSearchResultReader, useClass: PrismaEnrichedSearchResultReader },
    SaveLeadUseCase,
    ListSavedLeadsUseCase,
    GetSavedLeadUseCase,
    UpdateSavedLeadUseCase,
    RemoveSavedLeadUseCase,
    EnrichLeadUseCase,
  ],
})
export class LeadsModule {}
