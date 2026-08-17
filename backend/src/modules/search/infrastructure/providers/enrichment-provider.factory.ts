import type { AppConfig } from '../../../../config/configuration.js';
import { HttpWebsiteEnrichmentProvider } from '../adapters/http-website-enrichment.provider.js';
import { HttpSocialDiscoveryProvider } from '../adapters/http-social-discovery.provider.js';
import { HttpSocialVerificationProvider } from '../adapters/http-social-verification.provider.js';

export function createWebsiteEnrichmentProvider(enrichment: AppConfig['enrichment']): HttpWebsiteEnrichmentProvider {
  return new HttpWebsiteEnrichmentProvider({
    timeoutMs: enrichment.websiteTimeoutMs,
    userAgent: enrichment.userAgent,
    robotsTxtCache: new Map(),
  });
}

export function createSocialDiscoveryProvider(enrichment: AppConfig['enrichment']): HttpSocialDiscoveryProvider {
  return new HttpSocialDiscoveryProvider({
    timeoutMs: enrichment.socialTimeoutMs,
    userAgent: enrichment.userAgent,
    robotsTxtCache: new Map(),
  });
}

export function createSocialVerificationProvider(enrichment: AppConfig['enrichment']): HttpSocialVerificationProvider {
  return new HttpSocialVerificationProvider({
    timeoutMs: enrichment.verificationTimeoutMs,
    userAgent: enrichment.userAgent,
    robotsTxtCache: new Map(),
  });
}
