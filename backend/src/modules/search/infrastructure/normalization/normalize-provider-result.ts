import { NormalizedSearchResult, type VerificationStatus } from '../../domain/entities/normalized-search-result.js';
import type { ProviderSearchResult } from '../../domain/entities/provider-result.js';
import {
  normalizeLatitude,
  normalizeLongitude,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
} from '../../domain/entities/canonical-evidence.js';

export { normalizePhone, normalizeText, normalizeWebsite } from '../../domain/entities/canonical-evidence.js';

export function normalizeProviderResult(
  result: ProviderSearchResult,
  providerId: string,
  retrievedAt: Date,
): NormalizedSearchResult {
  return new NormalizedSearchResult(
    providerId,
    result.providerRecordId,
    normalizeText(result.companyName) ?? '',
    normalizeText(result.category),
    normalizeText(result.address),
    normalizePhone(result.phone),
    normalizeWebsite(result.website),
    normalizeRating(result.rating),
    result.ratingCount ?? null,
    toVerificationStatus(result.verificationStatus),
    normalizeText(result.sourceUrl),
    retrievedAt,
    normalizeText(result.area),
    normalizeLatitude(result.latitude),
    normalizeLongitude(result.longitude),
  );
}

export function normalizeRating(value: number | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 5) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function toVerificationStatus(value: string | undefined): VerificationStatus {
  if (value === 'VERIFIED' || value === 'UNVERIFIED') {
    return value;
  }
  return 'UNKNOWN';
}
