/**
 * Curated enrichment projection shared by the search and leads modules.
 *
 * Converts a stored enrichment snapshot into a safe, client-facing view:
 * - never exposes provider error messages
 * - only lets http(s) URLs through
 * - preserves the honest six-state enrichment status
 *
 * Pure data contract with no framework dependencies. The input is structural:
 * any stored snapshot shape (search results, leads) satisfying these fields
 * can be projected.
 */

export interface EnrichmentProjectionInput {
  website?: {
    title: string | null;
    description: string | null;
    techHints: string[];
    socialLinks: string[];
  };
  social?: {
    profiles: Array<{
      platform: string;
      handle: string;
      profileUrl: string;
      confidence: number;
      verified: boolean;
    }>;
  };
}

export interface WebsiteEnrichmentView {
  title: string | null;
  description: string | null;
  techHints: string[];
  socialLinks: string[];
}

export interface SocialProfileView {
  platform: string;
  handle: string;
  profileUrl: string | null;
  confidence: number;
  verified: boolean;
}

export interface SocialEnrichmentView {
  profiles: SocialProfileView[];
}

export interface EnrichmentView {
  status: string;
  enrichedAt: string | null;
  website: WebsiteEnrichmentView | null;
  social: SocialEnrichmentView | null;
}

const HTTP_SCHEMES = new Set(['http:', 'https:']);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return HTTP_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function projectEnrichment(
  status: string,
  snapshot: EnrichmentProjectionInput | null,
  enrichedAt: Date | null,
): EnrichmentView | null {
  if (status === 'PENDING') {
    return null;
  }

  return {
    status,
    enrichedAt: enrichedAt === null ? null : enrichedAt.toISOString(),
    website:
      snapshot?.website === undefined
        ? null
        : {
            title: snapshot.website.title,
            description: snapshot.website.description,
            techHints: [...snapshot.website.techHints],
            socialLinks: snapshot.website.socialLinks.filter((link) => isSafeHttpUrl(link)),
          },
    social:
      snapshot?.social === undefined
        ? null
        : {
            profiles: snapshot.social.profiles.map((profile) => ({
              platform: profile.platform,
              handle: profile.handle,
              profileUrl: isSafeHttpUrl(profile.profileUrl) ? profile.profileUrl : null,
              confidence: profile.confidence,
              verified: profile.verified,
            })),
          },
  };
}
