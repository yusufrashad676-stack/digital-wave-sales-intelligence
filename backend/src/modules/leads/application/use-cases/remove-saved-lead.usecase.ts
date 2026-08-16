import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

@Injectable()
export class RemoveSavedLeadUseCase {
  constructor(@Inject(LeadRepository) private readonly repository: LeadRepository) {}

  async remove(userId: string, leadId: string): Promise<void> {
    const removed = await this.repository.remove(userId, leadId);
    if (!removed) {
      throw new NotFoundException('Saved lead not found');
    }
  }
}
