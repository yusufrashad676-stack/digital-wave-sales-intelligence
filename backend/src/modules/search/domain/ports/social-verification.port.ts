/**
 * Port for verifying that a social media profile exists and is active.
 *
 * This is a domain-level contract with no framework dependencies.
 * The HTTP implementation is deferred to a later phase.
 */

export interface SocialVerificationRequest {
  platform: string;
  profileUrl: string;
  handle: string;
  timeoutMs: number;
}

export interface SocialVerificationResult {
  exists: boolean;
  active: boolean;
  displayName: string | null;
  verifiedAt: Date;
  provider: string;
}

export const SocialVerificationPort = Symbol('SocialVerificationPort');

export interface SocialVerificationPort {
  readonly providerId: string;
  verify(request: SocialVerificationRequest): Promise<SocialVerificationResult>;
}
