import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle } from '../../domain/entities/company-intelligence.js';
import { CompanyWebsiteDefectReport } from '../../domain/entities/website-defect.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';
import { CompanyWebsiteDefectService } from '../services/website-defect.service.js';

export interface GetCompanyWebsiteDefectInput {
  companyId: string;
}

/**
 * Reads persisted R4/R6.2 evidence and derives the root-website HTTP defect
 * report on the fly. Read-only: nothing is written, no transactions, no
 * presentation surface.
 */
@Injectable()
export class GetCompanyWebsiteDefectUseCase {
  constructor(
    @Inject(CompanyEvidenceRepository) private readonly evidenceRepository: CompanyEvidenceRepository,
    private readonly websiteDefectService: CompanyWebsiteDefectService,
  ) {}

  async execute(input: GetCompanyWebsiteDefectInput): Promise<CompanyWebsiteDefectReport> {
    const bundle: CompanyEvidenceBundle | null = await this.evidenceRepository.loadCompanyEvidence(input.companyId);
    if (bundle === null) {
      throw new NotFoundException(`Company ${input.companyId} has no website defect evidence.`);
    }
    return this.websiteDefectService.build(bundle);
  }
}
