import type { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { CriteriaValue, SearchIntentCriteria } from '../../domain/entities/search-intent.js';
import type { QualifiedResult, ResultQualification } from '../../domain/entities/discovery-run.js';

function observeWebsite(website: string | null): 'PRESENT' | 'ABSENT' {
  return website !== null && website.length > 0 ? 'PRESENT' : 'ABSENT';
}

function matchWebsiteCriteria(observed: 'PRESENT' | 'ABSENT', requested: CriteriaValue): boolean {
  if (requested === 'ANY') return true;
  return observed === requested;
}

function buildQualification(result: NormalizedSearchResult, criteria: SearchIntentCriteria): ResultQualification {
  const websiteObserved = observeWebsite(result.website);
  const websiteMatch = matchWebsiteCriteria(websiteObserved, criteria.website);

  if (!websiteMatch) {
    return {
      website: { requested: criteria.website, observed: websiteObserved, source: 'google-places' },
      social: { requested: criteria.social, observed: 'UNKNOWN', source: null },
      status: 'REJECTED',
      reason: `Website ${websiteObserved.toLowerCase()} but criterion is ${criteria.website.toLowerCase()}`,
    };
  }

  if (criteria.social !== 'ANY') {
    return {
      website: { requested: criteria.website, observed: websiteObserved, source: 'google-places' },
      social: { requested: criteria.social, observed: 'UNKNOWN', source: null },
      status: 'UNVERIFIED_SOCIAL',
      reason: 'Social presence requires enrichment and cannot be verified during discovery',
    };
  }

  return {
    website: { requested: criteria.website, observed: websiteObserved, source: 'google-places' },
    social: { requested: criteria.social, observed: 'UNKNOWN', source: null },
    status: 'QUALIFIED',
    reason: 'All discovery-level criteria satisfied',
  };
}

export function qualifyResults(results: NormalizedSearchResult[], criteria: SearchIntentCriteria): QualifiedResult[] {
  return results.map((result) => ({
    providerId: result.providerId,
    providerRecordId: result.providerRecordId,
    companyName: result.companyName,
    category: result.category,
    address: result.address,
    phone: result.phone,
    website: result.website,
    rating: result.rating,
    ratingCount: result.ratingCount,
    sourceUrl: result.sourceUrl,
    qualification: buildQualification(result, criteria),
  }));
}
