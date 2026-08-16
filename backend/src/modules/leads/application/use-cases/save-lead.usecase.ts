import { Inject, Injectable } from '@nestjs/common';
import type { LeadSnapshot, SaveLeadInput } from '../../domain/entities/lead.entity.js';
import { LeadRepository } from '../../domain/ports/lead.repository.js';

@Injectable()
export class SaveLeadUseCase {
  constructor(@Inject(LeadRepository) private readonly repository: LeadRepository) {}

  async save(userId: string, input: SaveLeadInput): Promise<LeadSnapshot> {
    return this.repository.save(userId, input);
  }
}
