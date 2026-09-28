export type ProviderVerificationStatus = 'VERIFIED' | 'UNVERIFIED';

export interface ProviderSearchResult {
  providerRecordId: string;
  companyName: string;
  category?: string;
  address?: string;
  area?: string;
  phone?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  verificationStatus?: ProviderVerificationStatus;
  sourceUrl?: string;
  latitude?: number;
  longitude?: number;
}

export interface ProviderResultSet {
  providerId: string;
  results: ProviderSearchResult[];
  // Optional raw/evidence payload captured from the provider's actual response
  // (e.g. the raw Google Places JSON). Persisted as RawImport evidence; never
  // exposed through the public API contract.
  rawEvidence?: unknown;
  // Token to pass as pageToken on the next request to retrieve subsequent results.
  // Undefined when there are no more pages.
  nextPageToken?: string;
}
