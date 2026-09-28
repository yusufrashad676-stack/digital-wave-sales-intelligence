import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../../database/generated/prisma/client.js';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';
import type { PersistResultBatchInput } from '../../domain/ports/search-persistence.repository.js';
import { PrismaSearchPersistenceRepository } from './prisma-search-persistence.repository.js';

/**
 * Real-PostgreSQL proof of the Company identity invariant (tests A–H) exercised
 * through the ACTUAL PrismaSearchPersistenceRepository transaction path, including its
 * parameterized INSERT ... ON CONFLICT DLL against the partial unique index
 * uq_companies_provider_identity_active.
 *
 * Runs ONLY when R2_TEST_DATABASE_URL is set (e.g. a throwaway local Postgres with all
 * migrations applied — never a production/cloud database). Skipped otherwise.
 */
const testUrl = process.env.R2_TEST_DATABASE_URL;

const SOURCE_CODE = `r2-spec-${Date.now()}`;
const EXECUTIONS: string[] = [];

let prisma: PrismaService;
let client: PrismaService['client'];
let repository: PrismaSearchPersistenceRepository;
let sourceId: string;
let jobId: string;

function result(providerRecordId: string, name = 'R2 Spec Business'): NormalizedSearchResult {
  return new NormalizedSearchResult(
    'google-places',
    providerRecordId,
    name,
    'dental-clinic',
    'Cairo',
    null,
    null,
    null,
    null,
    'UNKNOWN',
    null,
    new Date('2026-09-28T00:00:00Z'),
    null,
  );
}

function batchInput(executionId: string, results: NormalizedSearchResult[]): PersistResultBatchInput {
  return {
    executionId,
    importSourceId: sourceId,
    providerId: 'google-places',
    rawEvidence: { provider: 'google-places', results: results.map((r) => ({ id: r.providerRecordId })) },
    rawFormat: 'google-places:json',
    correlationId: `corr-${executionId}`,
    receivedAt: new Date(),
    results,
  };
}

describe(
  'PrismaSearchPersistenceRepository — Company identity against real PostgreSQL (R2 integration)',
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
      repository = new PrismaSearchPersistenceRepository(prisma);

      const source = await client.importSource.create({
        data: {
          code: SOURCE_CODE,
          name: 'R2 Integration Spec',
          category: 'search',
          capabilities: ['search'] as unknown as Prisma.InputJsonValue,
        },
      });
      sourceId = source.id;
      const job = await client.searchJob.create({
        data: { query: 'r2 integration', filters: {} as unknown as Prisma.InputJsonValue },
      });
      jobId = job.id;
      const exec = await client.searchExecution.create({
        data: { jobId, importSourceId: sourceId },
      });
      EXECUTIONS.push(exec.id);
    });

    after(async () => {
      await client.searchResult.deleteMany({ where: { execution: { jobId } } });
      await client.rawImport.deleteMany({ where: { execution: { jobId } } });
      await client.searchExecution.deleteMany({ where: { jobId } });
      await client.searchJob.deleteMany({ where: { id: jobId } });
      await client.company.deleteMany({ where: { importSource: { code: SOURCE_CODE } } });
      await client.importSource.deleteMany({ where: { code: SOURCE_CODE } });
      await prisma.client.$disconnect();
    });

    it('the partial unique index and FK exist in the migrated database', async () => {
      const indexRows = await client.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'companies' AND indexname = 'uq_companies_provider_identity_active'
      `);
      assert.equal(indexRows.length, 1);

      const fkRows = await client.$queryRaw<Array<{ conname: string }>>(Prisma.sql`
        SELECT conname FROM pg_constraint
        WHERE conname = 'companies_import_source_id_fkey'
      `);
      assert.equal(fkRows.length, 1);
    });

    it('A: first discovery creates one Company and links its SearchResult', async () => {
      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-a')]));

      const companies = await client.company.findMany({
        where: { importSourceId: sourceId, providerRecordId: 'rec-a' },
      });
      assert.equal(companies.length, 1);
      const results = await client.searchResult.findMany({
        where: { executionId: EXECUTIONS[0], providerRecordId: 'rec-a' },
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].companyId, companies[0].id);
      assert.equal(companies[0].isCanonical, false);
      assert.equal(companies[0].registrationNumber, null);
      assert.equal(companies[0].jurisdiction, null);
    });

    it('B: repeated discovery reuses the same Company and adds a second SearchResult', async () => {
      const secondExec = await client.searchExecution.create({ data: { jobId, importSourceId: sourceId } });
      EXECUTIONS.push(secondExec.id);

      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-b')]));
      await repository.persistResultBatch(batchInput(secondExec.id, [result('rec-b')]));

      const companies = await client.company.findMany({
        where: { importSourceId: sourceId, providerRecordId: 'rec-b' },
      });
      assert.equal(companies.length, 1);
      const results = await client.searchResult.findMany({
        where: { providerRecordId: 'rec-b', companyId: companies[0].id },
      });
      assert.equal(results.length, 2);
      for (const row of results) {
        assert.equal(row.companyId, companies[0].id);
      }
    });

    it('C: a different providerRecordId creates a different Company', async () => {
      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-c2')]));

      const companies = await client.company.findMany({
        where: { importSourceId: sourceId, providerRecordId: { in: ['rec-b', 'rec-c2'] } },
        orderBy: { providerRecordId: 'asc' },
      });
      assert.equal(companies.length, 2);
      assert.notEqual(companies[0].id, companies[1].id);
    });

    it('D: same name across different import sources never merges by name', async () => {
      const other = await client.importSource.create({
        data: {
          code: `${SOURCE_CODE}-other`,
          name: 'R2 Other Source',
          category: 'search',
          capabilities: ['search'] as unknown as Prisma.InputJsonValue,
        },
      });
      const otherExec = await client.searchExecution.create({ data: { jobId, importSourceId: other.id } });

      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-d', 'Shared Name')]));
      await repository.persistResultBatch({
        ...batchInput(otherExec.id, [result('rec-d', 'Shared Name')]),
        importSourceId: other.id,
      });

      const a = await client.company.findFirstOrThrow({
        where: { importSourceId: sourceId, providerRecordId: 'rec-d' },
      });
      const b = await client.company.findFirstOrThrow({
        where: { importSourceId: other.id, providerRecordId: 'rec-d' },
      });
      assert.equal(a.name, 'Shared Name');
      assert.equal(b.name, 'Shared Name');
      assert.notEqual(a.id, b.id);

      await client.searchResult.deleteMany({ where: { executionId: otherExec.id } });
      await client.rawImport.deleteMany({ where: { executionId: otherExec.id } });
      await client.searchExecution.deleteMany({ where: { id: otherExec.id } });
      await client.company.deleteMany({ where: { importSourceId: other.id } });
      await client.importSource.deleteMany({ where: { id: other.id } });
    });

    it('E: provenance chain — RawImport -> SearchResult -> Company is intact in the DB', async () => {
      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-e')]));

      const resultRow = await client.searchResult.findFirstOrThrow({
        where: { providerRecordId: 'rec-e' },
        include: { rawImport: true, company: true },
      });
      assert.equal(resultRow.rawImport.executionId, EXECUTIONS[0]);
      assert.equal(resultRow.company!.importSourceId, sourceId);
      assert.equal(resultRow.company!.providerRecordId, 'rec-e');
    });

    it('G: concurrent same-identity writes produce exactly one active Company', async () => {
      const g1 = await client.searchExecution.create({ data: { jobId, importSourceId: sourceId } });
      const g2 = await client.searchExecution.create({ data: { jobId, importSourceId: sourceId } });
      EXECUTIONS.push(g1.id, g2.id);

      await Promise.all([
        repository.persistResultBatch(batchInput(g1.id, [result('rec-g')])),
        repository.persistResultBatch(batchInput(g2.id, [result('rec-g')])),
      ]);

      const active = await client.company.findMany({
        where: { importSourceId: sourceId, providerRecordId: 'rec-g', deletedAt: null },
      });
      assert.equal(active.length, 1);
      const total = await client.company.count({
        where: { importSourceId: sourceId, providerRecordId: 'rec-g' },
      });
      assert.equal(total, 1);
    });

    it('H: soft delete frees the identity — rediscovery creates a NEW active Company', async () => {
      await repository.persistResultBatch(batchInput(EXECUTIONS[0], [result('rec-h')]));
      const original = await client.company.findFirstOrThrow({
        where: { importSourceId: sourceId, providerRecordId: 'rec-h', deletedAt: null },
      });

      await client.company.update({
        where: { id: original.id },
        data: { deletedAt: new Date() },
      });

      const h2 = await client.searchExecution.create({ data: { jobId, importSourceId: sourceId } });
      EXECUTIONS.push(h2.id);
      await repository.persistResultBatch(batchInput(h2.id, [result('rec-h')]));

      const all = await client.company.findMany({
        where: { importSourceId: sourceId, providerRecordId: 'rec-h' },
        orderBy: { createdAt: 'asc' },
      });
      assert.equal(all.length, 2);
      const alive = all.filter((c) => c.deletedAt === null);
      const gone = all.filter((c) => c.deletedAt !== null);
      assert.equal(alive.length, 1);
      assert.equal(gone.length, 1);
      assert.equal(gone[0].id, original.id);
      assert.notEqual(alive[0].id, original.id);
    });
  },
);
