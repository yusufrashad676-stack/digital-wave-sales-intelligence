import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle } from '../../domain/entities/company-intelligence.js';
import { CompanyGapAnalysis } from '../../domain/entities/company-gap-analysis.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';
import { CompanyGapAnalysisService } from '../services/company-gap-analysis.service.js';

export interface GetCompanyGapAnalysisInput {
  companyId: string;
}

/**
 * Reads persisted R4 evidence and derives a gap analysis on the fly. Nothing is
 * written, and the analysis is never served from a stored projection.
 */
@Injectable()
export class GetCompanyGapAnalysisUseCase {
  constructor(
    @Inject(CompanyEvidenceRepository) private readonly evidenceRepository: CompanyEvidenceRepository,
    private readonly gapAnalysisService: CompanyGapAnalysisService,
  ) {}

  async execute(input: GetCompanyGapAnalysisInput): Promise<CompanyGapAnalysis> {
    const bundle: CompanyEvidenceBundle | null = await this.evidenceRepository.loadCompanyEvidence(input.companyId);
    if (bundle === null) {
      throw new NotFoundException(`Company ${input.companyId} has no gap evidence.`);
    }
    return this.gapAnalysisService.build(bundle);
  }
}
