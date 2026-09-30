import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle, CompanyIntelligenceSummary } from '../../domain/entities/company-intelligence.js';
import { GetCompanyIntelligenceUseCase } from './get-company-intelligence.usecase.js';

const COMPANY_ID = 'company-1';

const PARSED_EVIDENCE: CompanyEvidenceBundle = {
  companyId: COMPANY_ID,
  companyName: 'Acme Corp',
  websites: [],
  phones: [],
  emails: [],
  socialProfiles: [],
  locations: [],
  observations: [],
};

const SUMMARY: CompanyIntelligenceSummary = {
  companyId: COMPANY_ID,
  companyName: 'Acme Corp',
  computedAt: '2026-06-15T12:00:00.000Z',
  dimensions: {} as CompanyIntelligenceSummary['dimensions'],
  quality: {} as CompanyIntelligenceSummary['quality'],
};

describe('GetCompanyIntelligenceUseCase', () => {
  function repoWith(bundle: CompanyEvidenceBundle | null) {
    return {
      loadCompanyEvidence: async (companyId: string) => (companyId === COMPANY_ID ? bundle : null),
    };
  }

  it('returns the intelligence summary when evidence exists', async () => {
    const service = { build: () => SUMMARY };
    const useCase = new GetCompanyIntelligenceUseCase(repoWith(PARSED_EVIDENCE), service);
    const result = await useCase.execute({ companyId: COMPANY_ID });
    assert.equal(result, SUMMARY);
  });

  it('throws RESOURCE_NOT_FOUND when the company has no evidence', async () => {
    const service = { build: () => SUMMARY };
    const useCase = new GetCompanyIntelligenceUseCase(repoWith(null), service);
    await assert.rejects(
      () => useCase.execute({ companyId: COMPANY_ID }),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal((error as NotFoundException).code, 'RESOURCE_NOT_FOUND');
        return true;
      },
    );
  });
});
