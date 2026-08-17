/**
 * Port for discovering social media profiles associated with a business.
 *
 * This is a domain-level contract with no framework dependencies.
 * The HTTP implementation is deferred to a later phase.
 */

export interface SocialDiscoveryRequest {
  domain: string;
  companyName: string;
  timeoutMs: number;
}

export interface DiscoveredSocialProfile {
  platform: string;
  handle: string;
  profileUrl: string;
  confidence: number;
}

export interface SocialDiscoveryResult {
  profiles: DiscoveredSocialProfile[];
  discoveredAt: Date;
  provider: string;
}

export const SocialDiscoveryPort = Symbol('SocialDiscoveryPort');

export interface SocialDiscoveryPort {
  readonly providerId: string;
  discover(request: SocialDiscoveryRequest): Promise<SocialDiscoveryResult>;
}
