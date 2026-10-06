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
  /**
   * Scan-completion marker for this one fetched body.
   *
   * true  — the response body was obtained AND the capability scanner evaluated that body.
   * false — the fetch path completed without an analyzable body (non-OK response or empty body).
   * absent — historical snapshot; the outcome is unknown.
   *
   * Deliberately narrow: it says nothing about a site-wide crawl, a global
   * capability inventory, website health, SEO, or whether a capability is absent.
   * It never defaults to true.
   */
  bodyAnalyzed?: boolean;
  /**
   * R6.2 root-website HTTP observation — factual metadata from the completed
   * SafeFetcher request for the HTTPS root page. Present only when a completed
   * HTTP response was obtained (fetch exceptions produce no snapshot at all);
   * absent in historical snapshots. Never inferred from other fields.
   *
   * `httpStatus` is the final HTTP status of that completed response.
   * `httpFinalUrl` is the fully resolved URL after SafeFetcher redirects.
   * `httpFinalSameOrigin` compares final URL origin to the requested root URL
   * origin (WHATWG `new URL(...).origin`); `null` when the final URL is
   * unparseable. A cross-origin or unresolved final response is never
   * attributed to the requested business.
   */
  httpStatus?: number | null;
  httpRedirected?: boolean;
  httpFinalUrl?: string | null;
  httpFinalSameOrigin?: boolean | null;
  emails?: string[];
  reachable?: boolean;
  https?: boolean;
  contactPageUrl?: string | null;
  hasContactForm?: boolean;
  bookingPageUrl?: string | null;
  whatsappUrl?: string | null;
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
