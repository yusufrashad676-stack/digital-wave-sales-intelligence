import { NormalizedSearchResult, type VerificationStatus } from '../../domain/entities/normalized-search-result.js';
import type { ProviderSearchResult } from '../../domain/entities/provider-result.js';

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
  );
}

export function normalizeText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhone(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }
  const digits = normalized.replace(/[^\d+]/g, '');
  if (digits.length === 0) {
    return null;
  }
  return digits.startsWith('+') ? digits : digits.replace(/^00/, '+');
}

export function normalizeWebsite(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }
  try {
    const withProtocol = normalized.includes('://') ? normalized : `https://${normalized}`;
    const url = new URL(withProtocol);
    return url.hostname.length > 0 ? `https://${url.hostname.toLowerCase()}` : null;
  } catch {
    return null;
  }
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
