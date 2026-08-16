import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import type { LeadSnapshot } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

@Injectable()
export class GetSavedLeadUseCase {
  constructor(@Inject(LeadRepository) private readonly repository: LeadRepository) {}

  async get(userId: string, leadId: string): Promise<LeadSnapshot> {
    const lead = await this.repository.findOwned(userId, leadId);
    if (lead === null) {
      throw new NotFoundException('Saved lead not found');
    }
    return lead;
  }
}
