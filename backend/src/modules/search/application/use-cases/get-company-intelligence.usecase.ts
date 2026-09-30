import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle, CompanyIntelligenceSummary } from '../../domain/entities/company-intelligence.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';
import { CompanyIntelligenceService } from '../services/company-intelligence.service.js';

export interface GetCompanyIntelligenceInput {
  companyId: string;
}

@Injectable()
export class GetCompanyIntelligenceUseCase {
  constructor(
    @Inject(CompanyEvidenceRepository) private readonly evidenceRepository: CompanyEvidenceRepository,
    private readonly intelligenceService: CompanyIntelligenceService,
  ) {}

  async execute(input: GetCompanyIntelligenceInput): Promise<CompanyIntelligenceSummary> {
    const bundle: CompanyEvidenceBundle | null = await this.evidenceRepository.loadCompanyEvidence(input.companyId);
    if (bundle === null) {
      throw new NotFoundException(`Company ${input.companyId} has no intelligence evidence.`);
    }
    return this.intelligenceService.build(bundle);
  }
}
