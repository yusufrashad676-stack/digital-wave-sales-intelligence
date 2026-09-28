import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { QualifiedResult, ResultQualification } from '../../domain/entities/discovery-run.js';
import type { CriteriaValue, SearchIntentCriteria } from '../../domain/entities/search-intent.js';
import type { ExecutionResultRow } from '../../domain/ports/enrichment.repository.js';
import { qualifyResults, requalifyWithEnrichment } from './qualification-filter.js';

export const DEFAULT_CRITERIA: SearchIntentCriteria = { website: 'ANY', social: 'ANY' };

function isCriteriaValue(value: unknown): value is CriteriaValue {
  return value === 'ANY' || value === 'PRESENT' || value === 'ABSENT';
}

export function extractCriteria(filters: unknown): SearchIntentCriteria {
  if (filters === null || typeof filters !== 'object') {
    return DEFAULT_CRITERIA;
  }
  const intent = (filters as { intent?: unknown }).intent;
  if (intent === null || typeof intent !== 'object') {
    return DEFAULT_CRITERIA;
  }
  const criteria = (intent as { criteria?: unknown }).criteria;
  if (criteria === null || typeof criteria !== 'object') {
    return DEFAULT_CRITERIA;
  }
  const { website, social } = criteria as { website?: unknown; social?: unknown };
  return {
    website: isCriteriaValue(website) ? website : 'ANY',
    social: isCriteriaValue(social) ? social : 'ANY',
  };
}

function toNormalizedResult(row: ExecutionResultRow): NormalizedSearchResult {
  return new NormalizedSearchResult(
    row.providerId,
    row.providerRecordId,
    row.companyName,
    row.category,
    row.formattedAddress,
    row.phone,
    row.websiteDomain,
    row.rating,
    row.ratingCount,
    row.verificationStatus as 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN',
    row.sourceUrl,
    row.retrievedAt,
    row.area,
  );
}

export function computeQualification(row: ExecutionResultRow, criteria: SearchIntentCriteria): ResultQualification {
  const qualified: QualifiedResult = qualifyResults([toNormalizedResult(row)], criteria)[0]!;
  if (row.enrichmentSnapshot?.social === undefined) {
    return qualified.qualification;
  }
  return requalifyWithEnrichment(qualified, row.enrichmentSnapshot).qualification;
}
