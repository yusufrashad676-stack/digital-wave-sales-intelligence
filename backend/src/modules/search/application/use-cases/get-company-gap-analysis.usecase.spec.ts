import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle } from '../../domain/entities/company-intelligence.js';
import { CompanyGapAnalysis, GapDimension, GapState } from '../../domain/entities/company-gap-analysis.js';
import { GetCompanyGapAnalysisUseCase } from './get-company-gap-analysis.usecase.js';

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

const ANALYSIS: CompanyGapAnalysis = {
  companyId: COMPANY_ID,
  companyName: 'Acme Corp',
  computedAt: '2026-06-15T12:00:00.000Z',
  gaps: [
    {
      dimension: GapDimension.WEBSITE,
      state: GapState.UNKNOWN,
      reasonCode: 'NO_EVIDENCE_OBSERVED',
      reason: '',
      evidence: [],
    },
  ],
} as CompanyGapAnalysis;

describe('GetCompanyGapAnalysisUseCase', () => {
  function repoWith(bundle: CompanyEvidenceBundle | null, calls: string[] = []) {
    return {
      loadCompanyEvidence: async (companyId: string) => {
        calls.push(companyId);
        return companyId === COMPANY_ID ? bundle : null;
      },
    };
  }

  it('returns the derived analysis when evidence exists', async () => {
    const service = { build: () => ANALYSIS };
    const useCase = new GetCompanyGapAnalysisUseCase(repoWith(PARSED_EVIDENCE), service);
    const result = await useCase.execute({ companyId: COMPANY_ID });
    assert.equal(result, ANALYSIS);
  });

  it('throws RESOURCE_NOT_FOUND when the company has no evidence', async () => {
    const service = { build: () => ANALYSIS };
    const useCase = new GetCompanyGapAnalysisUseCase(repoWith(null), service);
    await assert.rejects(
      () => useCase.execute({ companyId: COMPANY_ID }),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal((error as NotFoundException).code, 'RESOURCE_NOT_FOUND');
        return true;
      },
    );
  });

  it('derives on read without writing: exactly one evidence read per call', async () => {
    const calls: string[] = [];
    const service = { build: () => ANALYSIS };
    const useCase = new GetCompanyGapAnalysisUseCase(repoWith(PARSED_EVIDENCE, calls), service);
    await useCase.execute({ companyId: COMPANY_ID });
    await useCase.execute({ companyId: COMPANY_ID });
    assert.deepEqual(calls, [COMPANY_ID, COMPANY_ID]);
  });

  it('passes the persisted bundle through to the classifier unchanged', async () => {
    const received: CompanyEvidenceBundle[] = [];
    const service = {
      build: (bundle: CompanyEvidenceBundle) => {
        received.push(bundle);
        return ANALYSIS;
      },
    };
    const useCase = new GetCompanyGapAnalysisUseCase(repoWith(PARSED_EVIDENCE), service);
    await useCase.execute({ companyId: COMPANY_ID });
    assert.deepEqual(received, [PARSED_EVIDENCE]);
  });
});
