import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import type {
  ContactPromotionEvidence,
  SocialPromotionEvidence,
  WebsitePromotionEvidence,
} from '../../domain/entities/canonical-evidence.js';
import { PrismaCanonicalPromotionRepository } from './prisma-canonical-promotion.repository.js';

/**
 * Real-PostgreSQL proof of the canonical promotion identity invariants (R3 tests Q, R
 * and B) exercised through the ACTUAL PrismaCanonicalPromotionRepository transaction
 * path — including the parameterized INSERT ... ON CONFLICT (partial unique index)
 * pattern, the lookup-code resolution and the provenance columns.
 *
 * Runs ONLY when R3_TEST_DATABASE_URL is set (e.g. a throwaway local Postgres with all
 * migrations applied — never a production/cloud database). Skipped otherwise.
 */
const testUrl = process.env.R3_TEST_DATABASE_URL;

const SUFFIX = `${Date.now()}`;
const DOMAIN = `r3-website-${SUFFIX}.test`;
const PHONE = `+20100${SUFFIX}4567`;
const SOCIAL_URL = `https://facebook.com/r3-${SUFFIX}`;

let prisma: PrismaService;
let client: PrismaService['client'];
let repository: PrismaCanonicalPromotionRepository;
let companyA: string;
let companyB: string;

function websiteEvidence(overrides: Partial<WebsitePromotionEvidence> = {}): WebsitePromotionEvidence {
  return {
    domain: DOMAIN,
    url: `https://${DOMAIN}`,
    title: `R3 Website ${SUFFIX}`,
    description: 'R3 integration evidence',
    techHints: ['wordpress'],
    evidenceSource: 'http-website-enrichment',
    evidenceUrl: `https://${DOMAIN}`,
    observedAt: new Date('2026-08-10T11:00:00.000Z'),
    ...overrides,
  };
}

function contactEvidence(): ContactPromotionEvidence {
  return {
    type: 'phone',
    value: PHONE,
    countryCode: '+20',
    evidenceSource: 'google-places',
    observedAt: new Date('2026-08-10T11:00:00.000Z'),
  };
}

function socialEvidence(): SocialPromotionEvidence {
  return {
    platform: 'facebook',
    handle: `r3-${SUFFIX}`,
    profileUrl: SOCIAL_URL,
    evidenceSource: 'http-social-discovery',
    observedAt: new Date('2026-08-10T11:00:00.000Z'),
  };
}

describe(
  'PrismaCanonicalPromotionRepository — canonical identity, provenance, concurrency and soft-delete semantics (R3 integration)',
  { skip: testUrl === undefined },
  () => {
    before(async () => {
      const configStub = {
        getOrThrow: (key: string): string => {
          if (key === 'database.directUrl') {
            return testUrl!;
          }
          throw new Error(`Unexpected config key: ${key}`);
        },
      } as unknown as ConfigService;
      prisma = new PrismaService(configStub);
      client = prisma.client;
      repository = new PrismaCanonicalPromotionRepository(prisma);

      const a = await client.company.create({ data: { name: `R3 Company A ${SUFFIX}` } });
      const b = await client.company.create({ data: { name: `R3 Company B ${SUFFIX}` } });
      companyA = a.id;
      companyB = b.id;
    });

    after(async () => {
      const { websites, contactMethods, socialProfiles, links } = await collectCreatedRows();
      await client.companyWebsite.deleteMany({ where: { websiteId: { in: websites } } });
      await client.companyContactMethod.deleteMany({ where: { contactMethodId: { in: contactMethods } } });
      await client.companySocialProfile.deleteMany({ where: { socialProfileId: { in: socialProfiles } } });
      await client.website.deleteMany({ where: { id: { in: websites } } });
      await client.contactMethod.deleteMany({ where: { id: { in: contactMethods } } });
      await client.socialProfile.deleteMany({ where: { id: { in: socialProfiles } } });
      await client.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
      if (links.deleted === false) {
        // nothing further to clean; link cleanup happens above via website/social/contact ids
      }
      await prisma.client.$disconnect();
    });

    it('the three partial unique indexes and the lookup seeds exist in the migrated database', async () => {
      const indexes = await client.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename IN ('websites','contact_methods','social_profiles')
          AND indexname IN (
            'uq_websites_domain_active',
            'uq_contact_methods_type_value_active',
            'uq_social_profiles_platform_url_active'
          )
      `);
      assert.deepEqual(indexes.map((i) => i.indexname).sort(), [
        'uq_contact_methods_type_value_active',
        'uq_social_profiles_platform_url_active',
        'uq_websites_domain_active',
      ]);

      const types = await client.contactMethodType.findMany({
        where: { isActive: true, code: { in: ['phone', 'email'] } },
      });
      assert.deepEqual(types.map((t) => t.code).sort(), ['email', 'phone']);

      const platforms = await client.socialPlatform.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
      const codes = platforms.map((p) => p.code);
      assert.deepEqual(codes, [
        'facebook',
        'instagram',
        'linkedin',
        'pinterest',
        'snapchat',
        'tiktok',
        'twitter',
        'youtube',
      ]);
    });

    it('A: first promotion creates the canonical Website, links it and records provenance', async () => {
      const result = await repository.promoteWebsite(companyA, websiteEvidence());

      assert.equal(result.status, 'CREATED');
      const website = await client.website.findFirstOrThrow({ where: { domain: DOMAIN, deletedAt: null } });
      assert.equal(website.evidenceSource, 'http-website-enrichment');
      assert.equal(website.evidenceUrl, `https://${DOMAIN}`);
      assert.equal(website.observedAt?.toISOString(), '2026-08-10T11:00:00.000Z');
      const link = await client.companyWebsite.findFirstOrThrow({
        where: { companyId: companyA, websiteId: website.id },
      });
      assert.equal(link.companyId, companyA);
    });

    it('B: repeated promotion of an active domain yields LINKED, one active row, and shared canonical values across companies', async () => {
      const again = await repository.promoteWebsite(companyA, websiteEvidence());
      assert.equal(again.status, 'LINKED');

      const active = await client.website.findMany({ where: { domain: DOMAIN, deletedAt: null } });
      assert.equal(active.length, 1);

      const shared = await repository.promoteWebsite(companyB, websiteEvidence());
      assert.equal(shared.status, 'LINKED');
      // Same canonical Website row shared by both companies, each with its own link row.
      const links = await client.companyWebsite.findMany({
        where: { websiteId: active[0].id },
      });
      assert.equal(links.length, 2);
      assert.deepEqual(links.map((l) => l.companyId).sort(), [companyA, companyB].sort());
    });

    it('C: observed phone is promoted into a canonical ContactMethod with its lookup type', async () => {
      const result = await repository.promoteContactMethod(companyA, contactEvidence());

      assert.equal(result.status, 'CREATED');
      const method = await client.contactMethod.findFirstOrThrow({ where: { value: PHONE, deletedAt: null } });
      const type = await client.contactMethodType.findUniqueOrThrow({ where: { id: method.typeId } });
      assert.equal(type.code, 'phone');
      assert.equal(method.countryCode, '+20');
      assert.equal(method.evidenceSource, 'google-places');
      const link = await client.companyContactMethod.findFirstOrThrow({
        where: { companyId: companyA, contactMethodId: method.id },
      });
      assert.ok(link.id);
    });

    it('F: discovered social profile is promoted into a canonical SocialProfile', async () => {
      const result = await repository.promoteSocialProfile(companyA, socialEvidence());

      assert.equal(result.status, 'CREATED');
      const profile = await client.socialProfile.findFirstOrThrow({
        where: { profileUrl: SOCIAL_URL, deletedAt: null },
      });
      const platform = await client.socialPlatform.findUniqueOrThrow({ where: { id: profile.platformId } });
      assert.equal(platform.code, 'facebook');
      assert.equal(profile.evidenceSource, 'http-social-discovery');
      const link = await client.companySocialProfile.findFirstOrThrow({
        where: { companyId: companyA, socialProfileId: profile.id },
      });
      assert.ok(link.id);
    });

    it('D2: an unsupported lookup code is left un-created (no invented type)', async () => {
      const result = await repository.promoteSocialProfile(companyA, {
        ...socialEvidence(),
        platform: 'no-such-platform',
        profileUrl: `https://no-such/${SUFFIX}`,
      });
      assert.equal(result.status, 'LINKED');
      const count = await client.socialProfile.count({
        where: { profileUrl: `https://no-such/${SUFFIX}` },
      });
      assert.equal(count, 0);
    });

    it('Q: concurrent promotion of the same domain produces exactly one active canonical Website', async () => {
      const domainQ = `r3-race-${SUFFIX}.test`;
      await Promise.all([
        repository.promoteWebsite(companyA, websiteEvidence({ domain: domainQ, url: `https://${domainQ}` })),
        repository.promoteWebsite(companyB, websiteEvidence({ domain: domainQ, url: `https://${domainQ}` })),
      ]);

      const active = await client.website.findMany({ where: { domain: domainQ, deletedAt: null } });
      assert.equal(active.length, 1);
      const links = await client.companyWebsite.findMany({ where: { websiteId: active[0].id } });
      assert.equal(links.length, 2);
    });

    it('R: soft-deleting a canonical row frees its identity — re-promotion creates a NEW active row', async () => {
      const domainR = `r3-revive-${SUFFIX}.test`;
      const first = await repository.promoteWebsite(
        companyA,
        websiteEvidence({ domain: domainR, url: `https://${domainR}` }),
      );
      assert.equal(first.status, 'CREATED');
      const original = await client.website.findFirstOrThrow({ where: { domain: domainR, deletedAt: null } });

      await client.website.update({ where: { id: original.id }, data: { deletedAt: new Date() } });

      const again = await repository.promoteWebsite(
        companyA,
        websiteEvidence({ domain: domainR, url: `https://${domainR}` }),
      );
      assert.equal(again.status, 'CREATED');

      const alive = await client.website.findMany({ where: { domain: domainR, deletedAt: null } });
      assert.equal(alive.length, 1);
      assert.notEqual(alive[0].id, original.id);
      const total = await client.website.count({ where: { domain: domainR } });
      assert.equal(total, 2);
    });

    it('R2: soft-deleted ContactMethod does not block a new active row for the same value', async () => {
      const value = `+2015${SUFFIX}1234`;
      const before = await repository.promoteContactMethod(companyA, { ...contactEvidence(), value });
      assert.equal(before.status, 'CREATED');
      const original = await client.contactMethod.findFirstOrThrow({ where: { value, deletedAt: null } });

      await client.contactMethod.update({ where: { id: original.id }, data: { deletedAt: new Date() } });
      await client.companyContactMethod.deleteMany({ where: { contactMethodId: original.id } });

      const after = await repository.promoteContactMethod(companyB, { ...contactEvidence(), value });
      assert.equal(after.status, 'CREATED');
      const alive = await client.contactMethod.findMany({ where: { value, deletedAt: null } });
      assert.equal(alive.length, 1);
      assert.notEqual(alive[0].id, original.id);
    });

    async function collectCreatedRows(): Promise<{
      websites: string[];
      contactMethods: string[];
      socialProfiles: string[];
      links: { deleted: boolean };
    }> {
      const websites = (await client.website.findMany({ where: { domain: { contains: SUFFIX } } })).map((w) => w.id);
      const contactMethods = (await client.contactMethod.findMany({ where: { value: { contains: SUFFIX } } })).map(
        (c) => c.id,
      );
      const socialProfiles = (await client.socialProfile.findMany({ where: { profileUrl: { contains: SUFFIX } } })).map(
        (s) => s.id,
      );
      return { websites, contactMethods, socialProfiles, links: { deleted: true } };
    }
  },
);
