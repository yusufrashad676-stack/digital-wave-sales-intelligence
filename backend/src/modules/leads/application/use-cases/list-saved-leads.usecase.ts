import { Inject, Injectable } from '@nestjs/common';
import type { LeadSnapshot } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

@Injectable()
export class ListSavedLeadsUseCase {
  constructor(@Inject(LeadRepository) private readonly repository: LeadRepository) {}

  async list(userId: string): Promise<LeadSnapshot[]> {
    return this.repository.listByUser(userId);
  }
}
