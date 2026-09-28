import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrismaLeadRepository } from './prisma-lead.repository.js';

function stubPrisma(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      lead: {
        findFirst: async () => null,
        findUniqueOrThrow: async () => null,
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lead-1', ...data }),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
          id: where.id,
          ...data,
          userId: 'user-1',
          status: 'NEW',
          notes: null,
          providerId: 'mock',
          providerRecordId: 'rec-1',
          companyName: 'Test',
          category: null,
          area: null,
          formattedAddress: null,
          latitude: null,
          longitude: null,
          phone: null,
          email: null,
          websiteDomain: null,
          rating: null,
          ratingCount: null,
          sourceUrl: null,
          verificationStatus: 'UNKNOWN',
          enrichmentStatus: data.enrichmentStatus ?? 'PENDING',
          enrichmentSnapshot: data.enrichmentSnapshot ?? null,
          enrichedAt: data.enrichedAt ?? null,
          retrievedAt: new Date(),
          savedAt: new Date(),
          createdById: null,
          updatedById: 'user-1',
          deletedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
        updateMany: async () => {
          return { count: 1 };
        },
      },
      $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          lead: {
            findFirst: async (args: { where: Record<string, unknown> }) => {
              if (args.where.id === 'missing') return null;
              return { id: args.where.id, userId: 'user-1' };
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
              id: where.id,
              userId: 'user-1',
              status: 'NEW',
              notes: null,
              providerId: 'mock',
              providerRecordId: 'rec-1',
              companyName: 'Test',
              category: null,
              area: null,
              formattedAddress: null,
              phone: null,
              email: null,
              websiteDomain: null,
              rating: null,
              ratingCount: null,
              sourceUrl: null,
              verificationStatus: 'UNKNOWN',
              enrichmentStatus: data.enrichmentStatus ?? 'PENDING',
              enrichmentSnapshot: data.enrichmentSnapshot ?? null,
              enrichedAt: data.enrichedAt ?? null,
              retrievedAt: new Date(),
              savedAt: new Date(),
              createdById: null,
              updatedById: 'user-1',
              deletedById: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            }),
          },
        };
        return fn(tx);
      },
    },
    ...overrides,
  };
}

describe('PrismaLeadRepository — claimForEnrichment', () => {
  it('calls updateMany with correct ownership + stale window conditions', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma = stubPrisma({
      _tx: {},
    });
    (
      prisma.client.lead as unknown as {
        updateMany: (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => Promise<{ count: number }>;
      }
    ).updateMany = async ({ where, data: _data }) => {
      capturedWhere = where;
      return { count: 1 };
    };

    const repo = new PrismaLeadRepository(prisma as never);
    const result = await repo.claimForEnrichment('user-1', 'lead-1', 600000);

    assert.equal(result, true);
    assert.ok(capturedWhere);
    assert.equal((capturedWhere as { id: string }).id, 'lead-1');
    assert.equal((capturedWhere as { userId: string }).userId, 'user-1');
    assert.deepEqual((capturedWhere as { deletedAt: null }).deletedAt, null);
  });

  it('returns false when claim fails (0 rows affected)', async () => {
    const prisma = stubPrisma();
    (prisma.client.lead as unknown as { updateMany: () => Promise<{ count: number }> }).updateMany = async () => ({
      count: 0,
    });
    const repo = new PrismaLeadRepository(prisma as never);

    const result = await repo.claimForEnrichment('user-1', 'lead-1', 600000);
    assert.equal(result, false);
  });

  it('passes correct staleThresholdMs to the where clause', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma = stubPrisma();
    (
      prisma.client.lead as unknown as {
        updateMany: (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => Promise<{ count: number }>;
      }
    ).updateMany = async ({ where }) => {
      capturedWhere = where;
      return { count: 1 };
    };

    const repo = new PrismaLeadRepository(prisma as never);
    const before = Date.now();
    await repo.claimForEnrichment('user-1', 'lead-1', 300000);

    assert.ok(capturedWhere);
    const orConditions = (capturedWhere as { OR: Array<Record<string, unknown>> }).OR;
    assert.equal(orConditions.length, 2);
    // First condition: not IN_PROGRESS
    assert.deepEqual(orConditions[0], { enrichmentStatus: { not: 'IN_PROGRESS' } });
    // Second condition: IN_PROGRESS + stale — verify structure and that threshold was used
    const staleCond = orConditions[1] as { enrichmentStatus: string; updatedAt: { lt: Date } };
    assert.equal(staleCond.enrichmentStatus, 'IN_PROGRESS');
    assert.ok(staleCond.updatedAt.lt instanceof Date);
    // The stale threshold should be ~5 minutes ago (300000ms = 5 min)
    const expectedStale = new Date(before - 300000);
    const diff = Math.abs(staleCond.updatedAt.lt.getTime() - expectedStale.getTime());
    assert.ok(diff < 1000, `Stale threshold should be close to expected: diff=${diff}ms`);
  });
});

describe('PrismaLeadRepository — updateEnrichmentResult', () => {
  it('persists enrichment status, snapshot and enrichedAt', async () => {
    const prisma = stubPrisma();
    const repo = new PrismaLeadRepository(prisma as never);

    const snapshot = {
      website: { title: 'Test', description: null, techHints: [], socialLinks: [] },
      enrichedAt: '2026-08-18T12:00:00.000Z',
      enrichmentVersion: 1,
    };
    const enrichedAt = new Date('2026-08-18T12:00:00.000Z');

    const result = await repo.updateEnrichmentResult('user-1', 'lead-1', 'ENRICHED', snapshot, enrichedAt);

    assert.ok(result);
    assert.equal(result.enrichmentStatus, 'ENRICHED');
    assert.deepEqual(result.enrichmentSnapshot, snapshot);
  });

  it('returns null when lead not found or not owned', async () => {
    const prisma = stubPrisma();
    const repo = new PrismaLeadRepository(prisma as never);

    const result = await repo.updateEnrichmentResult('user-1', 'missing', 'ENRICHED', null, new Date());
    assert.equal(result, null);
  });
});
