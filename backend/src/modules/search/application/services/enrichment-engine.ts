import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  EnrichmentError,
  EnrichmentSnapshot,
  SocialProfileData,
  SocialEnrichmentData,
  WebsiteEnrichmentData,
} from '../../domain/entities/enrichment-snapshot.js';
import { CURRENT_ENRICHMENT_VERSION } from '../../domain/entities/enrichment-snapshot.js';
import { WebsiteEnrichmentPort } from '../../domain/ports/website-enrichment.port.js';
import { SocialDiscoveryPort } from '../../domain/ports/social-discovery.port.js';
import { SocialVerificationPort } from '../../domain/ports/social-verification.port.js';

export interface EnrichmentTarget {
  websiteDomain: string | null;
  companyName: string;
}

export interface EnrichSingleTargetOptions {
  skipWebsite?: boolean;
  skipSocial?: boolean;
}

export interface EnrichSingleTargetResult {
  status: 'ENRICHED' | 'PARTIALLY_ENRICHED' | 'ENRICHMENT_FAILED' | 'SKIPPED';
  snapshot: EnrichmentSnapshot;
  websiteFound: boolean;
  socialProfilesFound: number;
  socialProfilesVerified: number;
}

@Injectable()
export class EnrichmentEngine {
  private readonly logger = new Logger(EnrichmentEngine.name);

  constructor(
    @Inject(WebsiteEnrichmentPort) private readonly websiteProvider: WebsiteEnrichmentPort,
    @Optional() @Inject(SocialDiscoveryPort) private readonly socialDiscovery?: SocialDiscoveryPort,
    @Optional() @Inject(SocialVerificationPort) private readonly socialVerification?: SocialVerificationPort,
  ) {}

  async enrichSingleTarget(
    target: EnrichmentTarget,
    options?: EnrichSingleTargetOptions,
  ): Promise<EnrichSingleTargetResult> {
    const skipWebsite = options?.skipWebsite ?? false;
    const skipSocial = options?.skipSocial ?? false;

    const errors: EnrichmentError[] = [];
    let websiteData: WebsiteEnrichmentData | undefined;
    let socialData: SocialEnrichmentData | undefined;
    let websiteFound = false;
    let socialProfilesFound = 0;
    let socialProfilesVerified = 0;

    // Website enrichment
    if (!skipWebsite && target.websiteDomain) {
      try {
        const websiteResult = await this.websiteProvider.enrich({
          domain: target.websiteDomain,
          timeoutMs: 5000,
        });
        websiteData = websiteResult.data;
        websiteFound = true;
      } catch (error) {
        errors.push({
          type: 'website',
          message: error instanceof Error ? error.message : String(error),
          provider: this.websiteProvider.providerId,
        });
      }
    }

    // Social enrichment
    if (!skipSocial && this.socialDiscovery) {
      try {
        const socialResult = await this.socialDiscovery.discover({
          domain: target.websiteDomain ?? '',
          companyName: target.companyName,
          timeoutMs: 5000,
        });

        socialProfilesFound = socialResult.profiles.length;
        const profiles: SocialProfileData[] = [];

        for (const profile of socialResult.profiles) {
          let verified = false;

          if (this.socialVerification) {
            try {
              const verification = await this.socialVerification.verify({
                platform: profile.platform,
                profileUrl: profile.profileUrl,
                handle: profile.handle,
                timeoutMs: 3000,
              });
              verified = verification.exists && verification.active;
              if (verified) socialProfilesVerified++;
            } catch {
              // Verification failure = unverified, not a crash
            }
          }

          profiles.push({
            platform: profile.platform,
            handle: profile.handle,
            profileUrl: profile.profileUrl,
            confidence: profile.confidence,
            verified,
          });
        }

        socialData = {
          profiles,
          discoveredAt: socialResult.discoveredAt.toISOString(),
          provider: socialResult.provider,
        };
      } catch (error) {
        errors.push({
          type: 'social',
          message: error instanceof Error ? error.message : String(error),
          provider: this.socialDiscovery.providerId,
        });
      }
    }

    // Determine final status
    const hasWebsite = websiteData !== undefined;
    const hasSocial = socialData !== undefined;
    const hadWebsiteOpportunity = !skipWebsite && target.websiteDomain !== null;
    const hadSocialOpportunity = !skipSocial && this.socialDiscovery !== undefined;

    let finalStatus: EnrichSingleTargetResult['status'];
    if (!hadWebsiteOpportunity && !hadSocialOpportunity) {
      finalStatus = 'SKIPPED';
    } else if (hadWebsiteOpportunity && hadSocialOpportunity) {
      if (hasWebsite && hasSocial) {
        finalStatus = 'ENRICHED';
      } else if (hasWebsite || hasSocial) {
        finalStatus = 'PARTIALLY_ENRICHED';
      } else {
        finalStatus = 'ENRICHMENT_FAILED';
      }
    } else if (hadWebsiteOpportunity) {
      finalStatus = hasWebsite ? 'ENRICHED' : 'ENRICHMENT_FAILED';
    } else {
      finalStatus = hasSocial ? 'ENRICHED' : 'ENRICHMENT_FAILED';
    }

    // Build snapshot
    const snapshot: EnrichmentSnapshot = {
      enrichedAt: new Date().toISOString(),
      enrichmentVersion: CURRENT_ENRICHMENT_VERSION,
    };
    if (websiteData) snapshot.website = websiteData;
    if (socialData) snapshot.social = socialData;
    if (errors.length > 0) snapshot.errors = errors;

    return {
      status: finalStatus,
      snapshot,
      websiteFound,
      socialProfilesFound,
      socialProfilesVerified,
    };
  }
}
