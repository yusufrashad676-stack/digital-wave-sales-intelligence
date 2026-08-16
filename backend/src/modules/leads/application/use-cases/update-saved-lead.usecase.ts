import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadSnapshot, LeadStatus } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

export interface UpdateLeadPatch {
  status?: LeadStatus;
  notes?: string | null;
}

@Injectable()
export class UpdateSavedLeadUseCase {
  constructor(@Inject(LeadRepository) private readonly repository: LeadRepository) {}

  async update(userId: string, leadId: string, patch: UpdateLeadPatch): Promise<LeadSnapshot> {
    const updated = await this.repository.update(userId, leadId, patch);
    if (updated === null) {
      throw new NotFoundException('Saved lead not found');
    }
    return updated;
  }
}
