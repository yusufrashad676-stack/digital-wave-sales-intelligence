import { CompanyEvidenceBundle } from '../entities/company-intelligence.js';

export const CompanyEvidenceRepository = Symbol('CompanyEvidenceRepository');

export interface CompanyEvidenceRepository {
  loadCompanyEvidence(companyId: string): Promise<CompanyEvidenceBundle | null>;
}
