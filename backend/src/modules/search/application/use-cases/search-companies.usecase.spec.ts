import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestContextService } from '../../../../common/context/request-context.service.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { ProviderResultSet, ProviderSearchResult } from '../../domain/entities/provider-result.js';
import type { SearchQuery } from '../../domain/entities/search-query.js';
import type { ImportSourceRepository, ImportSourceSnapshot } from '../../domain/ports/import-source.repository.js';
import type {
  CompleteSearchExecutionInput,
  CreateSearchExecutionInput,
  FailSearchExecutionInput,
  SearchExecutionRepository,
  SearchExecutionSnapshot,
} from '../../domain/ports/search-execution.repository.js';
import type {
  CreateSearchJobInput,
  SearchJobRepository,
  SearchJobSnapshot,
} from '../../domain/ports/search-job.repository.js';
import type {
  PersistResultBatchInput,
  SearchPersistenceRepository,
} from '../../domain/ports/search-persistence.repository.js';
import type { SearchProviderPort } from '../../domain/ports/search-provider.port.js';
import { SearchCompaniesUseCase } from './search-companies.usecase.js';

const PRINCIPAL: AuthPrincipal = { userId: 'user-1', roles: ['MEMBER'], tokenType: 'access' };
const IMPORT_SOURCE: ImportSourceSnapshot = {
  id: 'source-1',
  code: 'mock',
  name: 'Mock',
  category: 'mock',
  enabled: true,
  capabilities: ['search'],
};

interface Harness {
  useCase: SearchCompaniesUseCase;
  lookup: string[];
  jobs: { created: CreateSearchJobInput[]; completed: string[]; failed: string[] };
  executions: {
    created: CreateSearchExecutionInput[];
    completed: Array<{ id: string } & CompleteSearchExecutionInput>;
    failed: Array<{ id: string } & FailSearchExecutionInput>;
  };
  batches: PersistResultBatchInput[];
}

function defaultProvider(resultSet: ProviderResultSet): SearchProviderPort {
  return {
    providerId: 'mock',
    capabilities: ['search'],
    search: async () => resultSet,
  } as unknown as SearchProviderPort;
}

function harnessWith(
  resultSet: ProviderResultSet,
  options: { provider?: SearchProviderPort; importSourceFound?: boolean } = {},
): Harness {
  const harness: Harness = {
    useCase: undefined as unknown as SearchCompaniesUseCase,
    lookup: [],
    jobs: { created: [], completed: [], failed: [] },
    executions: { created: [], completed: [], failed: [] },
    batches: [],
  };

  const importSources: ImportSourceRepository = {
    findByCode: async (code: string) => {
      harness.lookup.push(code);
      return options.importSourceFound === false ? null : IMPORT_SOURCE;
    },
  };

  const jobs: SearchJobRepository = {
    createJob: async (input: CreateSearchJobInput): Promise<SearchJobSnapshot> => {
      harness.jobs.created.push(input);
      return { id: 'job-1' };
    },
    markJobCompleted: async (id: string) => {
      harness.jobs.completed.push(id);
    },
    markJobFailed: async (id: string) => {
      harness.jobs.failed.push(id);
    },
    findRecentByUser: async () => [],
  };

  const executions: SearchExecutionRepository = {
    createExecution: async (input: CreateSearchExecutionInput): Promise<SearchExecutionSnapshot> => {
      harness.executions.created.push(input);
      return { id: 'execution-1' };
    },
    markExecutionCompleted: async (id: string, input: CompleteSearchExecutionInput) => {
      harness.executions.completed.push({ id, ...input });
    },
    markExecutionFailed: async (id: string, input: FailSearchExecutionInput) => {
      harness.executions.failed.push({ id, ...input });
    },
  };

  const persistence: SearchPersistenceRepository = {
    persistResultBatch: async (input: PersistResultBatchInput) => {
      harness.batches.push(input);
    },
  };

  harness.useCase = new SearchCompaniesUseCase(
    options.provider ?? defaultProvider(resultSet),
    importSources,
    jobs,
    executions,
    persistence,
    new RequestContextService(),
  );
  return harness;
}

function sampleResult(): ProviderSearchResult {
  return {
    providerRecordId: 'mock-clinic-001',
    companyName: 'عيادة د. أحمد',
    category: 'clinic',
    address: 'القاهرة',
    phone: '+20 100 123 4567',
    website: 'https://www.example.com',
    rating: 4.6,
    ratingCount: 128,
    verificationStatus: 'VERIFIED',
  };
}

function resultSetWith(...results: ProviderSearchResult[]): ProviderResultSet {
  return { providerId: 'mock', results, rawEvidence: { provider: 'mock', results } };
}

describe('SearchCompaniesUseCase', () => {
  it('returns normalized results from the provider', async () => {
    const { useCase } = harnessWith(resultSetWith(sampleResult()));
    const results = await useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL);

    assert.equal(results.length, 1);
    assert.equal(results[0]?.providerId, 'mock');
    assert.equal(results[0]?.companyName, 'عيادة د. أحمد');
    assert.equal(results[0]?.phone, '+201001234567');
    assert.equal(results[0]?.verificationStatus, 'VERIFIED');
  });

  it('creates a running job and execution before calling the provider', async () => {
    const { useCase, lookup, jobs, executions } = harnessWith(resultSetWith(sampleResult()));
    await useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL);

    assert.deepEqual(lookup, ['mock']);
    assert.deepEqual(jobs.created, [{ query: 'عيادات', filters: {}, userId: 'user-1', status: 'RUNNING' }]);
    assert.equal(executions.created.length, 1);
    assert.deepEqual(
      {
        jobId: executions.created[0]?.jobId,
        importSourceId: executions.created[0]?.importSourceId,
        attempt: executions.created[0]?.attempt,
        trigger: executions.created[0]?.trigger,
        status: executions.created[0]?.status,
        correlationId: executions.created[0]?.correlationId,
      },
      {
        jobId: 'job-1',
        importSourceId: 'source-1',
        attempt: 1,
        trigger: 'MANUAL',
        status: 'RUNNING',
        correlationId: 'unknown',
      },
    );
  });

  it('persists the raw evidence and normalized results, then completes execution and job', async () => {
    const { useCase, batches, jobs, executions } = harnessWith(resultSetWith(sampleResult()));
    await useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL);

    assert.equal(batches.length, 1);
    const batch = batches[0];
    assert.equal(batch.executionId, 'execution-1');
    assert.equal(batch.importSourceId, 'source-1');
    assert.equal(batch.providerId, 'mock');
    assert.equal(batch.rawFormat, 'mock:json');
    assert.equal(batch.correlationId, 'unknown');
    assert.deepEqual(batch.rawEvidence, { provider: 'mock', results: [sampleResult()] });
    assert.equal(batch.results.length, 1);
    assert.equal(batch.results[0]?.providerRecordId, 'mock-clinic-001');

    assert.equal(executions.completed.length, 1);
    const completed = executions.completed[0];
    assert.equal(completed.id, 'execution-1');
    assert.ok(completed.finishedAt instanceof Date);
    assert.equal(completed.metrics.providerResultCount, 1);
    assert.equal(completed.metrics.rawImportCount, 1);
    assert.equal(completed.metrics.persistedResultCount, 1);
    assert.ok(Number.isInteger(completed.metrics.durationMs) && completed.metrics.durationMs >= 0);

    assert.deepEqual(jobs.completed, ['job-1']);
    assert.deepEqual(jobs.failed, []);
    assert.deepEqual(executions.failed, []);
  });

  it('normalizes Google verification to UNKNOWN before persistence', async () => {
    const googleResult: ProviderSearchResult = {
      providerRecordId: 'ChIJ-place-001',
      companyName: 'عيادة المستقبل',
      verificationStatus: undefined,
    };
    const { useCase, batches } = harnessWith({
      providerId: 'google-places',
      results: [googleResult],
      rawEvidence: { places: [] },
    });
    await useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL);

    assert.equal(batches[0]?.results[0]?.verificationStatus, 'UNKNOWN');
  });

  it('completes a successful empty search with zero persisted results', async () => {
    const { useCase, batches, jobs, executions } = harnessWith({
      providerId: 'mock',
      results: [],
      rawEvidence: { results: [] },
    });

    const results = await useCase.search({ query: 'لا يوجد', filters: {} } as SearchQuery, PRINCIPAL);

    assert.deepEqual(results, []);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0]?.results, []);
    assert.equal(executions.completed.length, 1);
    assert.equal(executions.completed[0]?.metrics.providerResultCount, 0);
    assert.equal(executions.completed[0]?.metrics.persistedResultCount, 0);
    assert.deepEqual(jobs.completed, ['job-1']);
    assert.deepEqual(jobs.failed, []);
  });

  it('persists multiple results with one raw import and correct counts', async () => {
    const { useCase, batches, executions } = harnessWith(
      resultSetWith(sampleResult(), { ...sampleResult(), providerRecordId: 'mock-clinic-002' }),
    );
    const results = await useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL);

    assert.equal(results.length, 2);
    assert.equal(batches[0]?.results.length, 2);
    assert.equal(executions.completed[0]?.metrics.rawImportCount, 1);
    assert.equal(executions.completed[0]?.metrics.persistedResultCount, 2);
  });

  it('marks execution and job FAILED and rethrows when the provider fails', async () => {
    const failingProvider = {
      providerId: 'mock',
      capabilities: ['search'],
      search: async () => {
        throw new ServiceUnavailableException('Service temporarily unavailable', 'provider unavailable');
      },
    } as unknown as SearchProviderPort;
    const { useCase, batches, jobs, executions } = harnessWith(resultSetWith(), { provider: failingProvider });

    await assert.rejects(
      () => useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL),
      ServiceUnavailableException,
    );

    assert.deepEqual(batches, []);
    assert.equal(executions.failed.length, 1);
    assert.equal(executions.failed[0]?.id, 'execution-1');
    assert.equal(executions.failed[0]?.error, 'provider unavailable');
    assert.deepEqual(jobs.failed, ['job-1']);
    assert.deepEqual(jobs.completed, []);
    assert.deepEqual(executions.completed, []);
  });

  it('propagates a generic provider failure', async () => {
    const failingProvider = {
      providerId: 'mock',
      capabilities: ['search'],
      search: async () => {
        throw new Error('provider unavailable');
      },
    } as unknown as SearchProviderPort;
    const { useCase, executions, jobs } = harnessWith(resultSetWith(), { provider: failingProvider });

    await assert.rejects(
      () => useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL),
      /provider unavailable/,
    );

    assert.equal(executions.failed[0]?.error, 'provider unavailable');
    assert.deepEqual(jobs.failed, ['job-1']);
  });

  it('throws 503 without creating a job when the import source is missing', async () => {
    const { useCase, jobs, executions } = harnessWith(resultSetWith(sampleResult()), { importSourceFound: false });

    await assert.rejects(
      () => useCase.search({ query: 'عيادات', filters: {} } as SearchQuery, PRINCIPAL),
      ServiceUnavailableException,
    );

    assert.deepEqual(jobs.created, []);
    assert.deepEqual(executions.created, []);
  });
});
