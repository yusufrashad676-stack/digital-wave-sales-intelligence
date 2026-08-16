import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestContextService } from '../../../../common/context/request-context.service.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { ProviderResultSet, ProviderSearchResult } from '../../domain/entities/provider-result.js';
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
import { RunDiscoveryUseCase } from './run-discovery.usecase.js';

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
  useCase: RunDiscoveryUseCase;
  jobs: { created: CreateSearchJobInput[]; completed: string[]; failed: string[] };
  executions: {
    created: CreateSearchExecutionInput[];
    completed: Array<{ id: string } & CompleteSearchExecutionInput>;
    failed: Array<{ id: string } & FailSearchExecutionInput>;
  };
  batches: PersistResultBatchInput[];
}

function result(overrides: Partial<ProviderSearchResult> = {}): ProviderSearchResult {
  return {
    providerRecordId: 'mock-clinic-001',
    companyName: 'عيادة د. أحمد',
    category: 'dental-clinic',
    address: 'القاهرة',
    phone: '+20 100 123 4567',
    website: undefined,
    rating: 4.6,
    ratingCount: 128,
    ...overrides,
  };
}

function resultSetWith(...results: ProviderSearchResult[]): ProviderResultSet {
  return { providerId: 'mock', results, rawEvidence: { provider: 'mock', results } };
}

function harnessWith(
  resultSet: ProviderResultSet,
  options: { provider?: SearchProviderPort; importSourceFound?: boolean } = {},
): Harness {
  const harness: Harness = {
    useCase: undefined as unknown as RunDiscoveryUseCase,
    jobs: { created: [], completed: [], failed: [] },
    executions: { created: [], completed: [], failed: [] },
    batches: [],
  };

  const importSources: ImportSourceRepository = {
    findByCode: async () => (options.importSourceFound === false ? null : IMPORT_SOURCE),
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

  const defaultProvider: SearchProviderPort = {
    providerId: 'mock',
    capabilities: ['search'],
    search: async () => resultSet,
  } as unknown as SearchProviderPort;

  harness.useCase = new RunDiscoveryUseCase(
    options.provider ?? defaultProvider,
    importSources,
    jobs,
    executions,
    persistence,
    new RequestContextService(),
  );
  return harness;
}

describe('RunDiscoveryUseCase', () => {
  it('translates Arabic query and returns run result with intent', async () => {
    const { useCase } = harnessWith(resultSetWith(result()));
    const runResult = await useCase.run('هاتلي 100 عيادة أسنان في التجمع', PRINCIPAL);

    assert.equal(runResult.status, 'COMPLETED');
    assert.equal(runResult.query, 'هاتلي 100 عيادة أسنان في التجمع');
    assert.equal(runResult.intent.discovery.category, 'dental-clinic');
    assert.equal(runResult.intent.discovery.location.area, 'New Cairo');
    assert.equal(runResult.intent.opportunity.maxQuantity, 100);
  });

  it('creates job and execution before discovery', async () => {
    const { useCase, jobs, executions } = harnessWith(resultSetWith(result()));
    await useCase.run('عيادات أسنان في القاهرة', PRINCIPAL);

    assert.equal(jobs.created.length, 1);
    assert.equal(jobs.created[0]?.status, 'RUNNING');
    assert.equal(executions.created.length, 1);
    assert.equal(executions.created[0]?.jobId, 'job-1');
  });

  it('applies qualification and returns summary', async () => {
    const withWebsite = result({ providerRecordId: 'p1', website: 'https://example.com' });
    const withoutWebsite = result({ providerRecordId: 'p2', website: undefined });
    const { useCase } = harnessWith(resultSetWith(withWebsite, withoutWebsite));

    const runResult = await useCase.run('هاتلي عيادات بدون website', PRINCIPAL);

    assert.equal(runResult.summary.discovered, 2);
    assert.equal(runResult.results.length, 2);
    const qualified = runResult.results.filter((r) => r.qualification.status === 'QUALIFIED');
    const rejected = runResult.results.filter((r) => r.qualification.status === 'REJECTED');
    assert.equal(qualified.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(qualified[0]?.website, null);
    assert.equal(rejected[0]?.website, 'https://example.com');
  });

  it('returns UNVERIFIED_SOCIAL when social criteria is PRESENT', async () => {
    const { useCase } = harnessWith(resultSetWith(result()));
    const runResult = await useCase.run('هاتلي عيادات عندها social media', PRINCIPAL);

    assert.equal(runResult.results.length, 1);
    assert.equal(runResult.results[0]?.qualification.status, 'UNVERIFIED_SOCIAL');
    assert.ok(runResult.results[0]?.qualification.reason.includes('enrichment'));
  });

  it('returns UNVERIFIED_SOCIAL when social criteria is ABSENT', async () => {
    const { useCase } = harnessWith(resultSetWith(result()));
    const runResult = await useCase.run('هاتلي عيادات بدون social', PRINCIPAL);

    assert.equal(runResult.results.length, 1);
    assert.equal(runResult.results[0]?.qualification.status, 'UNVERIFIED_SOCIAL');
  });

  it('returns QUALIFIED when social criteria is ANY', async () => {
    const { useCase } = harnessWith(resultSetWith(result()));
    const runResult = await useCase.run('هاتلي عيادات أسنان', PRINCIPAL);

    assert.equal(runResult.results.length, 1);
    assert.equal(runResult.results[0]?.qualification.status, 'QUALIFIED');
  });

  it('persists results and completes execution with metrics', async () => {
    const { useCase, batches, executions, jobs } = harnessWith(resultSetWith(result()));
    await useCase.run('عيادات', PRINCIPAL);

    assert.equal(batches.length, 1);
    assert.equal(executions.completed.length, 1);
    assert.ok(executions.completed[0]?.metrics.discoveredCount !== undefined);
    assert.ok(executions.completed[0]?.metrics.qualifiedCount !== undefined);
    assert.deepEqual(jobs.completed, ['job-1']);
  });

  it('marks job FAILED on provider error', async () => {
    const failingProvider = {
      providerId: 'mock',
      capabilities: ['search'],
      search: async () => {
        throw new ServiceUnavailableException('Service temporarily unavailable', 'provider down');
      },
    } as unknown as SearchProviderPort;
    const { useCase, jobs, executions } = harnessWith(resultSetWith(), { provider: failingProvider });

    await assert.rejects(() => useCase.run('عيادات', PRINCIPAL), ServiceUnavailableException);

    assert.equal(executions.failed.length, 1);
    assert.deepEqual(jobs.failed, ['job-1']);
  });

  it('does not create Lead records', async () => {
    const { useCase } = harnessWith(resultSetWith(result()));
    const runResult = await useCase.run('عيادات', PRINCIPAL);

    assert.ok(runResult.results.length > 0);
    for (const r of runResult.results) {
      assert.ok(!('leadId' in r));
      assert.ok(!('status' in r) || 'qualification' in r);
    }
  });

  it('acceptance test: Arabic full query produces correct intent and qualification', async () => {
    const withWebsite = result({ providerRecordId: 'p1', website: 'https://example.com' });
    const withoutWebsite = result({ providerRecordId: 'p2', website: undefined });
    const { useCase } = harnessWith(resultSetWith(withWebsite, withoutWebsite));

    const runResult = await useCase.run(
      'هاتلي 100 عيادة أسنان في التجمع معندهاش Website وعندها Social Media',
      PRINCIPAL,
    );

    assert.equal(runResult.intent.discovery.category, 'dental-clinic');
    assert.equal(runResult.intent.discovery.location.area, 'New Cairo');
    assert.equal(runResult.intent.opportunity.maxQuantity, 100);
    assert.equal(runResult.intent.criteria.website, 'ABSENT');
    assert.equal(runResult.intent.criteria.social, 'PRESENT');

    const qualified = runResult.results.filter((r) => r.qualification.status === 'QUALIFIED');
    const unverified = runResult.results.filter((r) => r.qualification.status === 'UNVERIFIED_SOCIAL');
    const rejected = runResult.results.filter((r) => r.qualification.status === 'REJECTED');
    assert.equal(unverified.length, 1);
    assert.equal(unverified[0]?.website, null);
    assert.equal(qualified.length, 0);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.website, 'https://example.com');
  });
});
