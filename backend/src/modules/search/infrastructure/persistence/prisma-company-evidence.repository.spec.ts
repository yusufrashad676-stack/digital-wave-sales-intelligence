import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PrismaService } from '../../../../database/prisma/prisma.service.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';
import { PrismaCompanyEvidenceRepository } from './prisma-company-evidence.repository.js';

const COMPANY_ID = 'company-1';

interface FakeWebsite {
  id: string;
  domain: string;
  url: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | null;
  deletedAt: Date | null;
}

interface FakeContactMethod {
  id: string;
  type: { code: string };
  value: string;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | null;
  deletedAt: Date | null;
}

interface FakeSocialProfile {
  id: string;
  platform: { code: string };
  handle: string | null;
  profileUrl: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | null;
  deletedAt: Date | null;
}

interface FakeSearchResult {
  id: string;
  providerId: string;
  retrievedAt: Date;
  sourceUrl: string | null;
  websiteDomain: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  enrichmentSnapshot: unknown;
  deletedAt: Date | null;
}

interface FakeCompanyRow {
  id: string;
  name: string;
  deletedAt: Date | null;
  companyWebsites: Array<{ deletedAt: Date | null; website: FakeWebsite }>;
  companyContactMethods: Array<{ deletedAt: Date | null; contactMethod: FakeContactMethod }>;
  companySocialProfiles: Array<{ deletedAt: Date | null; socialProfile: FakeSocialProfile }>;
  searchResults: FakeSearchResult[];
}

class FakePrismaClient {
  company: {
    findFirst: (args: {
      where: { id: string; deletedAt: Date | null };
      select: unknown;
    }) => Promise<FakeCompanyRow | null>;
  };

  constructor(private readonly rows: FakeCompanyRow[]) {
    this.company = {
      findFirst: async (args) => {
        const match = this.rows.find((row) => row.id === args.where.id && row.deletedAt === null);
        if (match === undefined) {
          return null;
        }
        return {
          ...match,
          companyWebsites: match.companyWebsites.filter(
            (link) => link.deletedAt === null && link.website.deletedAt === null,
          ),
          companyContactMethods: match.companyContactMethods.filter(
            (link) => link.deletedAt === null && link.contactMethod.deletedAt === null,
          ),
          companySocialProfiles: match.companySocialProfiles.filter(
            (link) => link.deletedAt === null && link.socialProfile.deletedAt === null,
          ),
          searchResults: match.searchResults.filter((observed) => observed.deletedAt === null),
        };
      },
    };
  }
}

function repo(rows: FakeCompanyRow[]): CompanyEvidenceRepository {
  const prisma = { client: new FakePrismaClient(rows) } as unknown as PrismaService;
  return new PrismaCompanyEvidenceRepository(prisma);
}

function date(iso: string): Date {
  return new Date(iso);
}

function companyRow(overrides: Partial<FakeCompanyRow> = {}): FakeCompanyRow {
  return {
    id: COMPANY_ID,
    name: 'Acme Corp',
    deletedAt: null,
    companyWebsites: [],
    companyContactMethods: [],
    companySocialProfiles: [],
    searchResults: [],
    ...overrides,
  };
}

describe('PrismaCompanyEvidenceRepository', () => {
  it('returns null for an unknown company', async () => {
    const result = await repo([]).loadCompanyEvidence(COMPANY_ID);
    assert.equal(result, null);
  });

  it('maps canonical websites, contacts and social profiles with provenance', async () => {
    const row = companyRow({
      companyWebsites: [
        {
          deletedAt: null,
          website: {
            id: 'w-1',
            domain: 'acme.example',
            url: 'https://acme.example',
            evidenceSource: 'http-website-enrichment',
            evidenceUrl: 'https://acme.example',
            observedAt: date('2026-05-01T00:00:00.000Z'),
            deletedAt: null,
          },
        },
      ],
      companyContactMethods: [
        {
          deletedAt: null,
          contactMethod: {
            id: 'c-1',
            type: { code: 'phone' },
            value: '+15550100',
            evidenceSource: 'google-maps',
            evidenceUrl: 'https://maps.example/x',
            observedAt: date('2026-05-01T00:00:00.000Z'),
            deletedAt: null,
          },
        },
        {
          deletedAt: null,
          contactMethod: {
            id: 'c-2',
            type: { code: 'email' },
            value: 'hello@acme.example',
            evidenceSource: 'http-website-enrichment',
            evidenceUrl: 'https://acme.example',
            observedAt: date('2026-05-01T00:00:00.000Z'),
            deletedAt: null,
          },
        },
      ],
      companySocialProfiles: [
        {
          deletedAt: null,
          socialProfile: {
            id: 's-1',
            platform: { code: 'linkedin' },
            handle: 'acme',
            profileUrl: 'https://www.linkedin.com/company/acme',
            evidenceSource: 'social-discovery',
            evidenceUrl: 'https://www.linkedin.com/company/acme',
            observedAt: date('2026-05-01T00:00:00.000Z'),
            deletedAt: null,
          },
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.companyName, 'Acme Corp');
    assert.equal(bundle.websites.length, 1);
    assert.equal(bundle.websites[0].domain, 'acme.example');
    assert.equal(bundle.phones.length, 1);
    assert.equal(bundle.phones[0].value, '+15550100');
    assert.equal(bundle.emails.length, 1);
    assert.equal(bundle.emails[0].value, 'hello@acme.example');
    assert.equal(bundle.socialProfiles.length, 1);
    assert.equal(bundle.socialProfiles[0].platform, 'linkedin');
  });

  it('maps a successful website-check observation from the enrichment snapshot', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: 'https://maps.example/place/acme',
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: {
            website: { provider: 'http-website-enrichment', fetchedAt: '2026-05-01T00:00:00.000Z' },
            enrichedAt: '2026-05-01T00:00:00.001Z',
            enrichmentVersion: 1,
          },
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.observations.length, 1);
    assert.equal(bundle.observations[0].websiteDomain, 'acme.example');
    assert.equal(bundle.observations[0].websiteCheckSucceeded, true);
    assert.equal(bundle.observations[0].websiteCheckFailed, false);
    assert.equal(bundle.observations[0].websiteFetchedAt, '2026-05-01T00:00:00.000Z');
  });

  it('maps a failed website-check observation from enrichment errors', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: 'https://maps.example/place/acme',
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: {
            errors: [{ type: 'website', message: 'timeout', provider: 'http-website-enrichment' }],
            enrichedAt: '2026-05-01T00:00:00.001Z',
            enrichmentVersion: 1,
          },
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.observations[0].websiteCheckSucceeded, false);
    assert.equal(bundle.observations[0].websiteCheckFailed, true);
  });

  it('maps social checks with verified flags from the enrichment snapshot', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: null,
          websiteDomain: null,
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: {
            social: {
              profiles: [
                {
                  platform: 'linkedin',
                  handle: 'acme',
                  profileUrl: 'https://www.linkedin.com/company/acme',
                  confidence: 1,
                  verified: true,
                },
              ],
              discoveredAt: '2026-05-01T00:00:00.000Z',
              provider: 'fingerprintx',
            },
            enrichedAt: '2026-05-01T00:00:00.001Z',
            enrichmentVersion: 1,
          },
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.observations[0].socialChecks.length, 1);
    assert.equal(bundle.observations[0].socialChecks[0].verified, true);
    assert.equal(bundle.observations[0].socialChecks[0].profileUrl, 'https://www.linkedin.com/company/acme');
  });

  it('derives locations from observed coordinates plus formatted addresses', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: 'https://maps.example/place/acme',
          websiteDomain: null,
          latitude: 51.5074,
          longitude: -0.1278,
          formattedAddress: '1 London Way',
          enrichmentSnapshot: null,
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.locations.length, 1);
    assert.equal(bundle.locations[0].latitude, 51.5074);
    assert.equal(bundle.locations[0].formattedAddress, '1 London Way');
    assert.equal(bundle.locations[0].evidenceUrl, 'https://maps.example/place/acme');
  });

  it('ignores soft-deleted links, canonical rows and observations', async () => {
    const row = companyRow({
      companyWebsites: [
        {
          deletedAt: date('2026-06-01T00:00:00.000Z'),
          website: {
            id: 'w-del',
            domain: 'old.example',
            url: 'https://old.example',
            evidenceSource: null,
            evidenceUrl: null,
            observedAt: null,
            deletedAt: null,
          },
        },
        {
          deletedAt: null,
          website: {
            id: 'w-del-own',
            domain: 'removed.example',
            url: 'https://removed.example',
            evidenceSource: null,
            evidenceUrl: null,
            observedAt: null,
            deletedAt: date('2026-06-01T00:00:00.000Z'),
          },
        },
      ],
      searchResults: [
        {
          id: 'r-del',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: null,
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: null,
          deletedAt: date('2026-06-01T00:00:00.000Z'),
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.websites.length, 0);
    assert.equal(bundle.observations.length, 0);
  });

  it('degrades a malformed enrichment snapshot to no website check and no social checks', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: null,
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: 'not-json-object',
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.equal(bundle.observations[0].websiteCheckSucceeded, false);
    assert.equal(bundle.observations[0].websiteCheckFailed, false);
    assert.deepEqual(bundle.observations[0].socialChecks, []);
    assert.equal(bundle.observations[0].websiteCapabilities, null);
  });

  it('surfaces website capability signals from the enrichment snapshot', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: 'https://maps.example/place/acme',
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: {
            website: {
              title: 'Acme',
              fetchedAt: '2026-05-01T00:00:00.000Z',
              provider: 'http-website-enrichment',
              reachable: true,
              https: true,
              contactPageUrl: 'https://acme.example/contact',
              hasContactForm: true,
              bookingPageUrl: 'https://acme.example/book',
              whatsappUrl: 'https://wa.me/15550100',
            },
          },
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.deepEqual(bundle.observations[0].websiteCapabilities, {
      provider: 'http-website-enrichment',
      fetchedAt: '2026-05-01T00:00:00.000Z',
      reachable: true,
      https: true,
      contactPageUrl: 'https://acme.example/contact',
      hasContactForm: true,
      bookingPageUrl: 'https://acme.example/book',
      whatsappUrl: 'https://wa.me/15550100',
    });
  });

  it('normalises empty capability values to null rather than exposing blank evidence', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: null,
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: {
            website: {
              fetchedAt: '2026-05-01T00:00:00.000Z',
              provider: 'http-website-enrichment',
              reachable: 'yes',
              contactPageUrl: '   ',
              hasContactForm: 'true',
              bookingPageUrl: '',
            },
          },
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.deepEqual(bundle.observations[0].websiteCapabilities, {
      provider: 'http-website-enrichment',
      fetchedAt: '2026-05-01T00:00:00.000Z',
      reachable: null,
      https: null,
      contactPageUrl: null,
      hasContactForm: null,
      bookingPageUrl: null,
      whatsappUrl: null,
    });
  });

  it('maps commercial business signals onto the observation without touching evidence', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: 'https://maps.example/place/acme',
          websiteDomain: 'acme.example',
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: null,
          rating: 4.7,
          ratingCount: 264,
          category: 'clinic',
          area: 'New Cairo',
          verificationStatus: 'UNKNOWN',
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.deepEqual(bundle.observations[0].commercial, {
      rating: 4.7,
      ratingCount: 264,
      category: 'clinic',
      area: 'New Cairo',
      verificationStatus: 'UNKNOWN',
    });
    assert.equal(bundle.observations[0].websiteCapabilities, null);
    assert.equal(bundle.observations[0].websiteFetchedAt, null);
  });

  it('defaults every commercial field to null rather than inventing zeros or blanks', async () => {
    const row = companyRow({
      searchResults: [
        {
          id: 'r-1',
          providerId: 'google-maps',
          retrievedAt: date('2026-05-01T00:00:00.000Z'),
          sourceUrl: null,
          websiteDomain: null,
          latitude: null,
          longitude: null,
          formattedAddress: null,
          enrichmentSnapshot: null,
          rating: null,
          ratingCount: null,
          category: null,
          area: null,
          verificationStatus: null,
          deletedAt: null,
        },
      ],
    });

    const bundle = await repo([row]).loadCompanyEvidence(COMPANY_ID);
    assert.ok(bundle !== null);
    assert.deepEqual(bundle.observations[0].commercial, {
      rating: null,
      ratingCount: null,
      category: null,
      area: null,
      verificationStatus: null,
    });
  });
});
