import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnrichmentEngine } from './enrichment-engine.js';
import type { WebsiteEnrichmentPort } from '../../domain/ports/website-enrichment.port.js';
import type { SocialDiscoveryPort } from '../../domain/ports/social-discovery.port.js';
import type { SocialVerificationPort } from '../../domain/ports/social-verification.port.js';

function stubWebsiteProvider(overrides: Partial<WebsiteEnrichmentPort> = {}): WebsiteEnrichmentPort {
  return {
    providerId: 'http-website-enrichment',
    enrich: async () => ({
      domain: 'test.com',
      data: {
        title: 'Test Site',
        description: 'Great services',
        techHints: ['wordpress'],
        socialLinks: ['https://facebook.com/test'],
        fetchedAt: new Date().toISOString(),
        provider: 'http-website-enrichment',
      },
    }),
    ...overrides,
  };
}

function stubSocialDiscovery(overrides: Partial<SocialDiscoveryPort> = {}): SocialDiscoveryPort {
  return {
    providerId: 'http-social-discovery',
    discover: async () => ({
      profiles: [
        { platform: 'facebook', handle: 'testco', profileUrl: 'https://facebook.com/testco', confidence: 0.9 },
      ],
      discoveredAt: new Date(),
      provider: 'http-social-discovery',
    }),
    ...overrides,
  };
}

function stubSocialVerification(overrides: Partial<SocialVerificationPort> = {}): SocialVerificationPort {
  return {
    providerId: 'http-social-verification',
    verify: async () => ({
      exists: true,
      active: true,
      displayName: 'Test Co',
      verifiedAt: new Date(),
      provider: 'http-social-verification',
    }),
    ...overrides,
  };
}

const TARGET = { websiteDomain: 'test.com', companyName: 'Test Co' };

describe('EnrichmentEngine', () => {
  it('enriches website and social successfully', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery(), stubSocialVerification());
    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.websiteFound, true);
    assert.equal(result.socialProfilesFound, 1);
    assert.equal(result.socialProfilesVerified, 1);
    assert.ok(result.snapshot.website);
    assert.ok(result.snapshot.social);
    assert.equal(result.snapshot.social!.profiles[0].verified, true);
    assert.equal(result.snapshot.enrichmentVersion, 1);
    assert.ok(result.snapshot.enrichedAt);
  });

  it('returns PARTIALLY_ENRICHED when website succeeds but social fails', async () => {
    const socialDisc = stubSocialDiscovery({
      discover: async () => {
        throw new Error('Social provider down');
      },
    });
    const engine = new EnrichmentEngine(stubWebsiteProvider(), socialDisc);

    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.status, 'PARTIALLY_ENRICHED');
    assert.equal(result.websiteFound, true);
    assert.equal(result.socialProfilesFound, 0);
    assert.ok(result.snapshot.website);
    assert.equal(result.snapshot.social, undefined);
    assert.ok(result.snapshot.errors);
    assert.equal(result.snapshot.errors!.length, 1);
    assert.equal(result.snapshot.errors![0].type, 'social');
  });

  it('returns ENRICHMENT_FAILED when all providers fail', async () => {
    const engine = new EnrichmentEngine(
      stubWebsiteProvider({
        enrich: async () => {
          throw new Error('Network error');
        },
      }),
      stubSocialDiscovery({
        discover: async () => {
          throw new Error('Social down');
        },
      }),
    );

    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.status, 'ENRICHMENT_FAILED');
    assert.equal(result.websiteFound, false);
    assert.ok(result.snapshot.errors);
    assert.equal(result.snapshot.errors!.length, 2);
  });

  it('returns SKIPPED when no website domain and no social port', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider());
    const result = await engine.enrichSingleTarget({ websiteDomain: null, companyName: 'No Web Co' });

    assert.equal(result.status, 'SKIPPED');
    assert.equal(result.websiteFound, false);
    assert.equal(result.socialProfilesFound, 0);
  });

  it('enriches social-only when skipWebsite is true', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery());
    const result = await engine.enrichSingleTarget(TARGET, { skipWebsite: true });

    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.websiteFound, false);
    assert.equal(result.socialProfilesFound, 1);
    assert.equal(result.snapshot.website, undefined);
    assert.ok(result.snapshot.social);
  });

  it('enriches website-only when skipSocial is true', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery());
    const result = await engine.enrichSingleTarget(TARGET, { skipSocial: true });

    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.websiteFound, true);
    assert.equal(result.socialProfilesFound, 0);
    assert.ok(result.snapshot.website);
    assert.equal(result.snapshot.social, undefined);
  });

  it('does not fabricate verification when social verification port is absent', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery());
    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.socialProfilesVerified, 0);
    assert.equal(result.snapshot.social!.profiles[0].verified, false);
  });

  it('marks profile as unverified when verification fails', async () => {
    const verFail = stubSocialVerification({
      verify: async () => {
        throw new Error('Timeout');
      },
    });
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery(), verFail);
    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.socialProfilesVerified, 0);
    assert.equal(result.snapshot.social!.profiles[0].verified, false);
  });

  it('marks profile as unverified when exists=false or active=false', async () => {
    const verInactive = stubSocialVerification({
      verify: async () => ({
        exists: true,
        active: false,
        displayName: null,
        verifiedAt: new Date(),
        provider: 'test',
      }),
    });
    const engine = new EnrichmentEngine(stubWebsiteProvider(), stubSocialDiscovery(), verInactive);
    const result = await engine.enrichSingleTarget(TARGET);

    assert.equal(result.socialProfilesVerified, 0);
    assert.equal(result.snapshot.social!.profiles[0].verified, false);
  });

  it('website-only without domain returns SKIPPED', async () => {
    const engine = new EnrichmentEngine(stubWebsiteProvider());
    const result = await engine.enrichSingleTarget(
      { websiteDomain: null, companyName: 'No Domain' },
      { skipSocial: true },
    );

    assert.equal(result.status, 'SKIPPED');
  });

  it('records provider error messages in snapshot but not in returned status', async () => {
    const engine = new EnrichmentEngine(
      stubWebsiteProvider({
        enrich: async () => {
          throw new Error('Connection refused');
        },
      }),
    );
    const result = await engine.enrichSingleTarget({ websiteDomain: 'fail.com', companyName: 'Fail Co' });

    assert.equal(result.status, 'ENRICHMENT_FAILED');
    assert.ok(result.snapshot.errors);
    assert.equal(result.snapshot.errors![0].message, 'Connection refused');
    assert.equal(result.snapshot.errors![0].provider, 'http-website-enrichment');
  });
});
