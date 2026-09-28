import 'reflect-metadata';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { PrismaService } from '../../../../database/prisma/prisma.service.js';
import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { PersistResultBatchInput } from '../../domain/ports/search-persistence.repository.js';
import { PrismaSearchPersistenceRepository } from './prisma-search-persistence.repository.js';

interface CompanyRow {
  id: string;
  name: string;
  importSourceId: string;
  providerRecordId: string;
  deletedAt: Date | null;
}

interface SearchResultRow {
  id: string;
  executionId: string;
  rawImportId: string;
  providerId: string;
  providerRecordId: string;
  companyId: string | null;
  companyName: string;
  category: string | null;
  formattedAddress: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  websiteDomain: string | null;
  rating: number | null;
  ratingCount: number | null;
  sourceUrl: string | null;
  order: number;
}

interface RawImportRow {
  id: string;
  executionId: string;
  importSourceId: string;
  payload: unknown;
  recordCount: number;
}

/**
 * In-memory stand-in for the Postgres transaction client. It emulates the exact
 * semantics of the partial unique index uq_companies_provider_identity_active
 * (UNIQUE (import_source_id, provider_record_id) WHERE deleted_at IS NULL) so the
 * repository's INSERT ... ON CONFLICT ... DO NOTHING path can be exercised
 * deterministically without a database. The real database-wide guarantee is proven
 * separately against PostgreSQL in the env-gated integration spec.
 */
class FakeTx {
  companies: CompanyRow[] = [];
  searchResults: SearchResultRow[] = [];
  rawImports: RawImportRow[] = [];

  lastRawSql = '';
  lastRawValues: unknown[] = [];

  rawImport = {
    create: async (args: {
      data: {
        executionId: string;
        importSourceId: string;
        payload: unknown;
        recordCount: number;
      };
      select: { id: true };
    }): Promise<{ id: string }> => {
      const id = `raw-${this.rawImports.length + 1}`;
      this.rawImports.push({
        id,
        executionId: args.data.executionId,
        importSourceId: args.data.importSourceId,
        payload: args.data.payload,
        recordCount: args.data.recordCount,
      });
      return { id };
    },
  };

  searchResult = {
    create: async (args: {
      data: {
        executionId: string;
        rawImportId: string;
        providerId: string;
        providerRecordId: string;
        companyId: string;
        companyName: string;
        category: string | null;
        formattedAddress: string | null;
        area: string | null;
        phone: string | null;
        email: string | null;
        websiteDomain: string | null;
        rating: number | null;
        ratingCount: number | null;
        sourceUrl: string | null;
        ordering: number;
        verificationStatus: string;
        retrievedAt: Date;
      };
    }): Promise<{ id: string }> => {
      const id = `sr-${this.searchResults.length + 1}`;
      this.searchResults.push({
        id,
        executionId: args.data.executionId,
        rawImportId: args.data.rawImportId,
        providerId: args.data.providerId,
        providerRecordId: args.data.providerRecordId,
        companyId: args.data.companyId,
        companyName: args.data.companyName,
        category: args.data.category,
        formattedAddress: args.data.formattedAddress,
        area: args.data.area,
        phone: args.data.phone,
        email: args.data.email,
        websiteDomain: args.data.websiteDomain,
        rating: args.data.rating,
        ratingCount: args.data.ratingCount,
        sourceUrl: args.data.sourceUrl,
        order: args.data.ordering,
      });
      return { id };
    },
  };

  $queryRaw = async (sql: { strings: string[]; values: unknown[] }): Promise<Array<{ id: string }>> => {
    const text = sql.strings.join('?');
    const values = sql.values;
    this.lastRawSql = text;
    this.lastRawValues = values;

    if (text.includes('ON CONFLICT')) {
      const [id, name, importSourceId, providerRecordId] = values;
      const existing = this.companies.find(
        (c) => c.importSourceId === importSourceId && c.providerRecordId === providerRecordId && c.deletedAt === null,
      );
      if (existing) {
        return [];
      }
      this.companies.push({
        id: id as string,
        name: name as string,
        importSourceId: importSourceId as string,
        providerRecordId: providerRecordId as string,
        deletedAt: null,
      });
      return [{ id: id as string }];
    }

    const [importSourceId, providerRecordId] = values;
    const hit = this.companies.find(
      (c) => c.importSourceId === importSourceId && c.providerRecordId === providerRecordId && c.deletedAt === null,
    );
    return hit ? [{ id: hit.id }] : [];
  };
}

function harness(): { repository: PrismaSearchPersistenceRepository; tx: FakeTx } {
  const tx = new FakeTx();
  const prismaService = {
    client: {
      $transaction: async (fn: (t: FakeTx) => Promise<void>) => fn(tx),
    },
  } as unknown as PrismaService;
  return { repository: new PrismaSearchPersistenceRepository(prismaService), tx };
}

function result(overrides: Partial<Record<keyof NormalizedSearchResult, unknown>> = {}): NormalizedSearchResult {
  const base = {
    providerId: 'google-places',
    providerRecordId: 'mock-rec-001',
    companyName: 'Alpha Clinic',
    category: 'dental-clinic',
    address: 'Cairo',
    phone: '+20 100 000 0000',
    website: 'alpha-clinic.example',
    rating: 4.5,
    ratingCount: 100,
    verificationStatus: 'UNKNOWN' as const,
    sourceUrl: 'https://provider.example/results/1',
    retrievedAt: new Date('2026-09-28T00:00:00Z'),
    area: 'Downtown Cairo',
  };
  const merged = { ...base, ...overrides };
  return new NormalizedSearchResult(
    merged.providerId,
    merged.providerRecordId,
    merged.companyName,
    merged.category,
    merged.address,
    merged.phone,
    merged.website,
    merged.rating,
    merged.ratingCount,
    merged.verificationStatus,
    merged.sourceUrl,
    merged.retrievedAt,
    merged.area,
  );
}

function batchInput(
  overrides: Partial<PersistResultBatchInput> = {},
  results: NormalizedSearchResult[] = [result()],
): PersistResultBatchInput {
  return {
    executionId: 'exec-1',
    importSourceId: 'source-google-places',
    providerId: 'google-places',
    rawEvidence: { provider: 'google-places', results: [{ id: 'evidence-1' }] },
    rawFormat: 'google-places:json',
    correlationId: 'corr-1',
    receivedAt: new Date('2026-09-28T00:00:01Z'),
    results,
    ...overrides,
  };
}

describe('PrismaSearchPersistenceRepository — Company identity resolution (deterministic)', () => {
  it('A: first discovery creates one Company and links the SearchResult to it', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(batchInput());

    assert.equal(tx.companies.length, 1);
    assert.equal(tx.searchResults.length, 1);
    assert.equal(tx.searchResults[0].companyId, tx.companies[0].id);
    assert.equal(tx.companies[0].name, 'Alpha Clinic');
    assert.equal(tx.companies[0].importSourceId, 'source-google-places');
    assert.equal(tx.companies[0].providerRecordId, 'mock-rec-001');
    assert.equal(tx.companies[0].deletedAt, null);

    assert.match(tx.lastRawSql, /ON CONFLICT \("import_source_id", "provider_record_id"\) WHERE "deleted_at" IS NULL/);
  });

  it('B: repeated discovery keeps one Company and adds a second SearchResult pointing at it', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(batchInput());
    await repository.persistResultBatch(batchInput({ executionId: 'exec-2', correlationId: 'corr-2' }));

    assert.equal(tx.companies.length, 1);
    assert.equal(tx.searchResults.length, 2);
    assert.equal(tx.rawImports.length, 2);
    assert.equal(tx.searchResults[0].companyId, tx.companies[0].id);
    assert.equal(tx.searchResults[1].companyId, tx.companies[0].id);
  });

  it('C: different providerRecordId creates a different Company', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(batchInput({}, [result({ providerRecordId: 'rec-1' })]));
    await repository.persistResultBatch(batchInput({ executionId: 'exec-2' }, [result({ providerRecordId: 'rec-2' })]));

    assert.equal(tx.companies.length, 2);
    assert.notEqual(tx.companies[0].id, tx.companies[1].id);
    assert.equal(tx.searchResults[0].companyId, tx.companies[0].id);
    assert.equal(tx.searchResults[1].companyId, tx.companies[1].id);
  });

  it('D: same company name across different import sources never merges by name', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(batchInput({}, [result({ companyName: 'Acme' })]));
    await repository.persistResultBatch(
      batchInput({ executionId: 'exec-2', importSourceId: 'source-other', providerId: 'other' }, [
        result({ companyName: 'Acme' }),
      ]),
    );

    assert.equal(tx.companies.length, 2);
    assert.equal(tx.companies[0].name, 'Acme');
    assert.equal(tx.companies[1].name, 'Acme');
    assert.notEqual(tx.companies[0].id, tx.companies[1].id);
  });

  it('E: provenance preserved — RawImport holds raw payload, every SearchResult links to it and to the Company', async () => {
    const { repository, tx } = harness();
    const evidence = { provider: 'google-places', results: [{ id: 'e1' }, { id: 'e2' }] };
    await repository.persistResultBatch(
      batchInput({ rawEvidence: evidence }, [
        result({ providerRecordId: 'rec-1' }),
        result({ providerRecordId: 'rec-2' }),
      ]),
    );

    assert.equal(tx.rawImports.length, 1);
    assert.equal(tx.rawImports[0].recordCount, 2);
    assert.equal(tx.rawImports[0].payload, evidence);
    assert.equal(tx.searchResults.length, 2);
    for (const row of tx.searchResults) {
      assert.equal(row.rawImportId, tx.rawImports[0].id);
      assert.notEqual(row.companyId, null);
    }
    assert.equal(new Set(tx.searchResults.map((r) => r.companyId)).size, 2);
  });

  it('G: concurrent writes for the same identity cannot produce two active Companies', async () => {
    const { repository, tx } = harness();
    await Promise.all([
      repository.persistResultBatch(batchInput()),
      repository.persistResultBatch(batchInput({ executionId: 'exec-2', correlationId: 'corr-2' })),
    ]);

    assert.equal(tx.companies.filter((c) => c.deletedAt === null).length, 1);
    assert.equal(tx.searchResults.length, 2);
    assert.equal(tx.searchResults[0].companyId, tx.searchResults[1].companyId);
  });

  it('H: soft delete frees the identity — rediscovery creates a NEW Company, never resurrects', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(batchInput());
    const original = tx.companies[0];
    original.deletedAt = new Date('2026-09-28T12:00:00Z');

    await repository.persistResultBatch(batchInput({ executionId: 'exec-2', correlationId: 'corr-2' }));

    assert.equal(tx.companies.length, 2);
    assert.equal(tx.companies[0].deletedAt !== null, true);
    assert.equal(tx.companies[1].deletedAt, null);
    assert.notEqual(tx.companies[1].id, original.id);
    assert.equal(
      tx.companies.filter(
        (c) =>
          c.importSourceId === 'source-google-places' && c.providerRecordId === 'mock-rec-001' && c.deletedAt !== null,
      ).length,
      1,
    );
    assert.equal(
      tx.companies.filter(
        (c) =>
          c.importSourceId === 'source-google-places' && c.providerRecordId === 'mock-rec-001' && c.deletedAt === null,
      ).length,
      1,
    );
    assert.equal(tx.searchResults[0].companyId, original.id);
    assert.equal(tx.searchResults[1].companyId, tx.companies[1].id);
  });

  it('I: no negative claims from missing evidence and no invented legal identity', async () => {
    const { repository, tx } = harness();
    await repository.persistResultBatch(
      batchInput({}, [
        result({
          companyName: 'Quiet Business',
          category: null,
          address: null,
          phone: null,
          website: null,
          rating: null,
          ratingCount: null,
          verificationStatus: 'UNKNOWN' as const,
          sourceUrl: null,
          area: null,
        }),
      ]),
    );

    const row = tx.searchResults[0];
    assert.equal(row.email, null);
    assert.equal(row.websiteDomain, null);
    assert.equal(row.phone, null);
    assert.equal(row.rating, null);

    const company = tx.companies[0];
    assert.equal(company.name, 'Quiet Business');
    assert.equal(Object.prototype.hasOwnProperty.call(company, 'registrationNumber'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(company, 'jurisdiction'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(company, 'isCanonical'), false);
    assert.doesNotMatch(tx.lastRawSql, /registration_number|jurisdiction|legal_name|tax_vat_id/);
  });

  it('provider values are bound parameters, never interpolated into SQL', async () => {
    const { repository, tx } = harness();
    const sentinel = 'SENTINEL-${providerRecordId}-"';
    await repository.persistResultBatch(
      batchInput({}, [result({ providerRecordId: sentinel, companyName: 'Name SENTINEL' })]),
    );

    assert.doesNotMatch(tx.lastRawSql, /SENTINEL/);
    assert.ok(tx.lastRawValues.includes(sentinel));
  });

  it('repo schema/migration contract: partial unique index and FK are declared', () => {
    const root = resolve(import.meta.dirname, '../../../../../../');
    const migration = readFileSync(
      resolve(root, 'prisma/migrations/20260819000000_add_company_provider_identity/migration.sql'),
      'utf8',
    );
    assert.match(migration, /CREATE UNIQUE INDEX "uq_companies_provider_identity_active"/);
    assert.match(
      migration,
      /ON "companies" \("import_source_id", "provider_record_id"\)\s*\n\s*WHERE "deleted_at" IS NULL/,
    );
    assert.match(migration, /companies_import_source_id_fkey/);
    assert.match(migration, /ADD COLUMN "provider_record_id" VARCHAR\(512\)/);

    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
    const companyBlock = schema.slice(schema.indexOf('model Company'), schema.indexOf('model CompanyAddress'));
    assert.match(companyBlock, /importSourceId\s+String\?\s+@map\("import_source_id"\)/);
    assert.match(companyBlock, /providerRecordId\s+String\?\s+@map\("provider_record_id"\) @db.VarChar\(512\)/);
    const importSourceBlock = schema.slice(schema.indexOf('model ImportSource'), schema.indexOf('model SearchJob'));
    assert.match(importSourceBlock, /companies\s+Company\[\]/);
  });
});
