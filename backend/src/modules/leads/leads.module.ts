import { Module } from '@nestjs/common';
import { GetSavedLeadUseCase } from './application/use-cases/get-saved-lead.usecase.js';
import { ListSavedLeadsUseCase } from './application/use-cases/list-saved-leads.usecase.js';
import { RemoveSavedLeadUseCase } from './application/use-cases/remove-saved-lead.usecase.js';
import { SaveLeadUseCase } from './application/use-cases/save-lead.usecase.js';
import { UpdateSavedLeadUseCase } from './application/use-cases/update-saved-lead.usecase.js';
import { LeadRepository } from './domain/ports/lead.repository.js';
import { PrismaLeadRepository } from './infrastructure/repositories/prisma-lead.repository.js';
import { LeadsController } from './presentation/controllers/leads.controller.js';

@Module({
  controllers: [LeadsController],
  providers: [
    { provide: LeadRepository, useClass: PrismaLeadRepository },
    SaveLeadUseCase,
    ListSavedLeadsUseCase,
    GetSavedLeadUseCase,
    UpdateSavedLeadUseCase,
    RemoveSavedLeadUseCase,
  ],
})
export class LeadsModule {}
