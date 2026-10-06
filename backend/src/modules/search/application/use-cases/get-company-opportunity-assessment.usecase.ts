import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle, DataQualityReport } from '../../domain/entities/company-intelligence.js';
import { CompanyGapAnalysis } from '../../domain/entities/company-gap-analysis.js';
import { CompanyOpportunityAssessment } from '../../domain/entities/company-opportunity-assessment.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';
import { CompanyGapAnalysisService } from '../services/company-gap-analysis.service.js';
import { CompanyIntelligenceService } from '../services/company-intelligence.service.js';
import { CompanyOpportunityAssessmentService } from '../services/company-opportunity-assessment.service.js';

export interface GetCompanyOpportunityAssessmentInput {
  companyId: string;
}

/**
 * Reads persisted evidence once, then composes the three independent derived
 * views: R4 data quality, R5 digital gaps, and R6 maturity/coverage. Commercial
 * opportunity is not derived from any of them.
 */
@Injectable()
export class GetCompanyOpportunityAssessmentUseCase {
  constructor(
    @Inject(CompanyEvidenceRepository) private readonly evidenceRepository: CompanyEvidenceRepository,
    private readonly intelligenceService: CompanyIntelligenceService,
    private readonly gapAnalysisService: CompanyGapAnalysisService,
    private readonly assessmentService: CompanyOpportunityAssessmentService,
  ) {}

  async execute(input: GetCompanyOpportunityAssessmentInput): Promise<CompanyOpportunityAssessment> {
    const bundle: CompanyEvidenceBundle | null = await this.evidenceRepository.loadCompanyEvidence(input.companyId);
    if (bundle === null) {
      throw new NotFoundException(`Company ${input.companyId} has no opportunity assessment evidence.`);
    }

    const quality: DataQualityReport = this.intelligenceService.build(bundle).quality;
    const gaps: CompanyGapAnalysis = this.gapAnalysisService.build(bundle);
    return this.assessmentService.build(bundle, gaps, quality);
  }
}
