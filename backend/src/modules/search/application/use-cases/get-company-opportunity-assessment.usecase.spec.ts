import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NotFoundException } from '../../../../common/exceptions/not-found.exception.js';
import { CompanyEvidenceBundle } from '../../domain/entities/company-intelligence.js';
import { OpportunityReasonCode, OpportunityState } from '../../domain/entities/company-opportunity-assessment.js';
import { CompanyGapAnalysisService } from '../services/company-gap-analysis.service.js';
import { CompanyIntelligenceService } from '../services/company-intelligence.service.js';
import { CompanyOpportunityAssessmentService } from '../services/company-opportunity-assessment.service.js';
import { GetCompanyOpportunityAssessmentUseCase } from './get-company-opportunity-assessment.usecase.js';

const COMPANY_ID = 'company-1';
const FETCHED_AT = '2026-05-01T00:00:00.000Z';

const EMPTY: CompanyEvidenceBundle = {
  companyId: COMPANY_ID,
  companyName: 'Acme Corp',
  websites: [],
  phones: [],
  emails: [],
  socialProfiles: [],
  locations: [],
  observations: [],
};

const EVIDENCE: CompanyEvidenceBundle = {
  ...EMPTY,
  websites: [
    {
      domain: 'acme.example',
      url: 'https://acme.example',
      evidenceSource: 'http-website-enrichment',
      evidenceUrl: 'https://acme.example',
      observedAt: FETCHED_AT,
    },
  ],
  socialProfiles: [
    {
      platform: 'instagram',
      handle: 'acme',
      profileUrl: 'https://instagram.com/acme',
      evidenceSource: 'http-social-discovery',
      evidenceUrl: 'https://instagram.com/acme',
      observedAt: FETCHED_AT,
    },
  ],
  observations: [
    {
      retrievedAt: FETCHED_AT,
      sourceUrl: 'https://maps.example/place/acme',
      websiteDomain: 'acme.example',
      latitude: null,
      longitude: null,
      formattedAddress: null,
      websiteCheckSucceeded: true,
      websiteCheckFailed: false,
      websiteFetchedAt: FETCHED_AT,
      socialChecks: [],
      websiteCapabilities: {
        provider: 'http-website-enrichment',
        fetchedAt: FETCHED_AT,
        bodyAnalyzed: true,
        reachable: true,
        https: true,
        contactPageUrl: null,
        hasContactForm: true,
        bookingPageUrl: 'https://acme.example/book',
        whatsappUrl: 'https://wa.me/1',
      },
      commercial: {
        rating: 4.8,
        ratingCount: 311,
        category: 'clinic',
        area: null,
        verificationStatus: 'UNKNOWN',
      },
    },
  ],
};

function repoWith(bundle: CompanyEvidenceBundle | null, calls: string[] = []) {
  return {
    loadCompanyEvidence: async (companyId: string) => {
      calls.push(companyId);
      return companyId === COMPANY_ID ? bundle : null;
    },
  };
}

function realServices() {
  return {
    intelligence: new CompanyIntelligenceService(),
    gaps: new CompanyGapAnalysisService(),
    assessment: new CompanyOpportunityAssessmentService(),
  };
}

function buildUseCase(bundle: CompanyEvidenceBundle | null, calls: string[] = []) {
  const { intelligence, gaps, assessment } = realServices();
  return new GetCompanyOpportunityAssessmentUseCase(repoWith(bundle, calls), intelligence, gaps, assessment);
}

describe('GetCompanyOpportunityAssessmentUseCase', () => {
  it('returns the derived assessment when evidence exists', async () => {
    const useCase = buildUseCase(EVIDENCE);
    const result = await useCase.execute({ companyId: COMPANY_ID });
    assert.equal(result.companyId, COMPANY_ID);
    assert.equal(result.engineVersion, 1);
    assert.equal(typeof result.computedAt, 'string');
  });

  it('throws RESOURCE_NOT_FOUND when the company has no evidence', async () => {
    const useCase = buildUseCase(null);
    await assert.rejects(
      () => useCase.execute({ companyId: COMPANY_ID }),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal((error as NotFoundException).code, 'RESOURCE_NOT_FOUND');
        return true;
      },
    );
  });

  it('derives on read: exactly one evidence read per call', async () => {
    const calls: string[] = [];
    const useCase = buildUseCase(EVIDENCE, calls);
    await useCase.execute({ companyId: COMPANY_ID });
    await useCase.execute({ companyId: COMPANY_ID });
    assert.deepEqual(calls, [COMPANY_ID, COMPANY_ID]);
  });

  it('feeds the identical bundle to quality, gaps, and assessment', async () => {
    const seen: CompanyEvidenceBundle[] = [];
    const assessment = { companyId: COMPANY_ID, engineVersion: 1 } as never;
    const useCase = new GetCompanyOpportunityAssessmentUseCase(
      repoWith(EVIDENCE),
      {
        build: (bundle: CompanyEvidenceBundle) => {
          seen.push(bundle);
          return { quality: {} };
        },
      },
      {
        build: (bundle: CompanyEvidenceBundle) => {
          seen.push(bundle);
          return { gaps: [] };
        },
      },
      {
        build: (bundle: CompanyEvidenceBundle) => {
          seen.push(bundle);
          return assessment;
        },
      },
    );
    const result = await useCase.execute({ companyId: COMPANY_ID });
    assert.equal(result, assessment);
    assert.equal(seen.length, 3);
    for (const bundle of seen) {
      assert.equal(bundle, EVIDENCE, 'every derivation must receive the same bundle instance');
    }
  });

  it('keeps quality, maturity, coverage, and opportunity as four separate concepts', async () => {
    const result = await buildUseCase(EVIDENCE).execute({ companyId: COMPANY_ID });

    assert.ok(result.quality, 'R4 quality must be present');
    assert.ok(result.maturity, 'R5-derived maturity must be present');
    assert.ok(result.coverage, 'coverage confidence must be present');
    assert.ok(result.opportunity, 'opportunity must be present');

    assert.ok(Object.keys(result.quality).length > 0);
    assert.ok(result.maturity.score >= 0 && result.maturity.score <= 100);
    assert.ok(result.coverage.value >= 0 && result.coverage.value <= 100);
    assert.notEqual(result.maturity, result.coverage);
    assert.notEqual(result.maturity, result.quality);
  });

  it('reports opportunity as UNDETERMINED even for fully demonstrated evidence', async () => {
    const empty = await buildUseCase(EMPTY).execute({ companyId: COMPANY_ID });
    const full = await buildUseCase(EVIDENCE).execute({ companyId: COMPANY_ID });

    assert.equal(empty.opportunity.state, OpportunityState.UNDETERMINED);
    assert.equal(empty.opportunity.reasonCode, OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS);
    assert.equal(empty.opportunity.provenGapCount, 0);

    assert.equal(full.opportunity.state, OpportunityState.UNDETERMINED);
    assert.equal(full.opportunity.reasonCode, OpportunityReasonCode.INSUFFICIENT_PROVEN_GAPS);
    assert.equal(full.opportunity.provenGapCount, 0);

    assert.ok(full.maturity.score > empty.maturity.score, 'fixture should raise maturity');
    assert.ok(full.coverage.value > empty.coverage.value, 'fixture should raise coverage');
    assert.deepEqual(full.opportunity, empty.opportunity, 'opportunity must not move with maturity or coverage');
  });

  it('emits no opportunity band or numeric opportunity score', async () => {
    const result = await buildUseCase(EVIDENCE).execute({ companyId: COMPANY_ID });
    assert.deepEqual(Object.keys(result.opportunity).sort(), ['provenGapCount', 'reason', 'reasonCode', 'state']);
  });

  it('is deterministic across repeated reads', async () => {
    const useCase = buildUseCase(EVIDENCE);
    const first = await useCase.execute({ companyId: COMPANY_ID });
    const second = await useCase.execute({ companyId: COMPANY_ID });
    assert.deepEqual({ ...second, computedAt: null }, { ...first, computedAt: null });
  });
});
