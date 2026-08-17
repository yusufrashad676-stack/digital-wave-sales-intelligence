/**
 * Domain types for enrichment snapshots.
 *
 * These types are pure data contracts with no framework dependencies.
 * The snapshot is stored as JSON on SearchResult.enrichmentSnapshot.
 */

export interface WebsiteEnrichmentData {
  title: string | null;
  description: string | null;
  techHints: string[];
  socialLinks: string[];
  fetchedAt: string;
  provider: string;
}

export interface SocialProfileData {
  platform: string;
  handle: string;
  profileUrl: string;
  confidence: number;
  verified: boolean;
}

export interface SocialEnrichmentData {
  profiles: SocialProfileData[];
  discoveredAt: string;
  provider: string;
}

export interface EnrichmentError {
  type: 'website' | 'social';
  message: string;
  provider: string;
}

export interface EnrichmentSnapshot {
  website?: WebsiteEnrichmentData;
  social?: SocialEnrichmentData;
  errors?: EnrichmentError[];
  enrichedAt: string;
  enrichmentVersion: number;
}

export const CURRENT_ENRICHMENT_VERSION = 1;
