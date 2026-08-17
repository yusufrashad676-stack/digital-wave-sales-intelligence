import type { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { CriteriaValue, SearchIntentCriteria } from '../../domain/entities/search-intent.js';
import type { QualifiedResult, ResultQualification } from '../../domain/entities/discovery-run.js';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';

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

function hasVerifiedSocial(snapshot: EnrichmentSnapshot | null): boolean {
  return snapshot?.social?.profiles?.some((p) => p.verified === true) ?? false;
}

function hasAnySocial(snapshot: EnrichmentSnapshot | null): boolean {
  return (snapshot?.social?.profiles?.length ?? 0) > 0;
}

export function requalifyWithEnrichment(result: QualifiedResult, snapshot: EnrichmentSnapshot | null): QualifiedResult {
  const socialRequested = result.qualification.social.requested;

  if (socialRequested === 'ANY') {
    return result;
  }

  const verified = hasVerifiedSocial(snapshot);
  const anySocial = hasAnySocial(snapshot);

  if (socialRequested === 'PRESENT') {
    if (verified) {
      return {
        ...result,
        qualification: {
          ...result.qualification,
          social: { requested: 'PRESENT', observed: 'PRESENT', source: 'enrichment' },
          status: 'QUALIFIED',
          reason: 'Social presence verified via enrichment',
        },
      };
    }
    if (anySocial) {
      return {
        ...result,
        qualification: {
          ...result.qualification,
          social: { requested: 'PRESENT', observed: 'PRESENT', source: 'enrichment' },
          status: 'UNVERIFIED_SOCIAL',
          reason: 'Social profiles found but not verified',
        },
      };
    }
    return {
      ...result,
      qualification: {
        ...result.qualification,
        social: { requested: 'PRESENT', observed: 'ABSENT', source: 'enrichment' },
        status: 'REJECTED',
        reason: 'Social presence required but none found via enrichment',
      },
    };
  }

  // socialRequested === 'ABSENT'
  if (anySocial) {
    return {
      ...result,
      qualification: {
        ...result.qualification,
        social: { requested: 'ABSENT', observed: 'PRESENT', source: 'enrichment' },
        status: 'REJECTED',
        reason: 'Social absence required but profiles found via enrichment',
      },
    };
  }
  return {
    ...result,
    qualification: {
      ...result.qualification,
      social: { requested: 'ABSENT', observed: 'ABSENT', source: 'enrichment' },
      status: 'QUALIFIED',
      reason: 'No social profiles found as required',
    },
  };
}
