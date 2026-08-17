# Phase D — Enrichment Implementation Spec

## Purpose

This document specifies the enrichment layer that takes Phase C discovery
results and enriches them with website metadata and social presence data. It
resolves the `UNVERIFIED_SOCIAL` qualification gap by providing actual social
presence signals, enabling re-qualification of search results.

---

## 1. Enrichment Provider Interfaces

All ports live in `backend/src/modules/search/domain/ports/` and follow the
existing `SearchProviderPort` pattern: Symbol-based DI, pure interfaces, zero
framework imports.

### 1.1 WebsiteEnrichmentPort

```ts
// domain/ports/website-enrichment.port.ts

export interface WebsiteEnrichmentRequest {
  domain: string;
  timeoutMs: number;
}

export interface WebsiteEnrichmentResult {
  domain: string;
  title: string | null;
  description: string | null;
  techHints: string[];
  socialLinks: string[];
  fetchedAt: Date;
  provider: string;
}

export const WebsiteEnrichmentPort = Symbol('WebsiteEnrichmentPort');

export interface WebsiteEnrichmentPort {
  readonly providerId: string;
  enrich(request: WebsiteEnrichmentRequest): Promise<WebsiteEnrichmentResult>;
}
```

**Responsibilities:**
- Fetch the homepage HTML of a given domain
- Extract `<title>`, `<meta description>`, Open Graph tags
- Detect technology stack via header analysis, script fingerprints, meta tags
- Extract social media links from the page
- Return structured metadata; never store anything

**Error contract:**
- Throw `ServiceUnavailableException` with `ErrorCode.SERVICE_UNAVAILABLE` on
  timeout, network error, or non-2xx response
- Never throw on missing optional data (title/description absent = null)

### 1.2 SocialDiscoveryPort

```ts
// domain/ports/social-discovery.port.ts

export interface SocialDiscoveryRequest {
  domain: string;
  companyName: string;
  timeoutMs: number;
}

export interface DiscoveredSocialProfile {
  platform: string;
  handle: string;
  profileUrl: string;
  confidence: number;
}

export interface SocialDiscoveryResult {
  profiles: DiscoveredSocialProfile[];
  discoveredAt: Date;
  provider: string;
}

export const SocialDiscoveryPort = Symbol('SocialDiscoveryPort');

export interface SocialDiscoveryPort {
  readonly providerId: string;
  discover(request: SocialDiscoveryRequest): Promise<SocialDiscoveryResult>;
}
```

**Responsibilities:**
- Given a domain or company name, discover social media profiles
- Return profiles with a confidence score (0.0–1.0)
- Deduplicate by platform + handle
- Return empty array (not null) when no profiles found

**Error contract:**
- Throw `ServiceUnavailableException` on provider failure
- Never throw on zero results (empty array is valid)

### 1.3 SocialVerificationPort

```ts
// domain/ports/social-verification.port.ts

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
```

**Responsibilities:**
- Confirm that a social profile actually exists and is accessible
- Detect if the profile is active (has recent posts, not suspended)
- Return lightweight verification evidence

**Error contract:**
- Throw `ServiceUnavailableException` on provider failure
- If the profile cannot be reached, return `{ exists: false, active: false }`
  (not an exception — this is expected behavior)

---

## 2. Enrichment Data Model

### 2.1 Design Decision: Enrichment Snapshot on SearchResult

**Decision:** Store enrichment data as a `Json` snapshot field on `SearchResult`,
not in separate tables.

**Rationale:**
1. Enrichment data is a point-in-time snapshot tied to a specific SearchResult.
   It is evidence, not canonical data.
2. The existing schema already uses `Json` snapshots for similar purposes:
   `activitySnapshot` on SocialProfile, `techHints` on Website, `metrics` on
   SearchExecution.
3. SearchResult has an advisory nullable `companyId` — writing to `Website` or
   `SocialProfile` tables requires a real Company FK, which doesn't exist at
   enrichment time.
4. Promotion to canonical tables (`Website`, `SocialProfile`, `CompanyWebsite`,
   `CompanySocialProfile`) happens at lead save time, not enrichment time.
5. This keeps Phase D simple, reversible, and non-destructive.

**Alternative considered:** New `SearchResultEnrichment` table. Rejected because
it adds a migration, join complexity, and transactional overhead for data that
is naturally a snapshot.

### 2.2 Schema Changes

Add to `prisma/schema.prisma` on the `SearchResult` model:

```prisma
enum EnrichmentStatus {
  PENDING
  IN_PROGRESS
  ENRICHED
  PARTIALLY_ENRICHED
  ENRICHMENT_FAILED
  SKIPPED
}

model SearchResult {
  // ... existing fields ...

  enrichmentStatus EnrichmentStatus @default(PENDING) @map("enrichment_status")
  enrichmentSnapshot Json?           @map("enrichment_snapshot")
  enrichedAt       DateTime?         @map("enriched_at") @db.Timestamptz

  @@index([enrichmentStatus], map: "idx_search_results_enrichment_status")
  @@index([executionId, enrichmentStatus], map: "idx_search_results_execution_enrichment")
  // ... existing indexes ...
}
```

### 2.3 EnrichmentSnapshot Shape

```typescript
// domain/entities/enrichment-snapshot.ts

export interface WebsiteEnrichmentData {
  title: string | null;
  description: string | null;
  techHints: string[];
  socialLinks: string[];
  fetchedAt: string;
  provider: string;
}

export interface SocialProfileData {
  platform: string;
  handle: string;
  profileUrl: string;
  confidence: number;
  verified: boolean;
}

export interface SocialEnrichmentData {
  profiles: SocialProfileData[];
  discoveredAt: string;
  provider: string;
}

export interface EnrichmentError {
  type: 'website' | 'social';
  message: string;
  provider: string;
}

export interface EnrichmentSnapshot {
  website?: WebsiteEnrichmentData;
  social?: SocialEnrichmentData;
  errors?: EnrichmentError[];
  enrichedAt: string;
  enrichmentVersion: number;
}
```

**Key properties:**
- `enrichmentVersion`: schema version for forward compatibility. Start at `1`.
- `errors`: partial failures are recorded, not thrown. Allows partial success.
- `website`/`social` are optional: absent means not attempted or failed.

---

## 3. Enrichment Orchestration

### 3.1 Use-Case: EnrichSearchResultsUseCase

**Location:** `backend/src/modules/search/application/use-cases/enrich-search-results.usecase.ts`

**Input:**
```typescript
export interface EnrichSearchResultsInput {
  executionId: string;
  principal: AuthPrincipal;
  options?: {
    skipWebsite?: boolean;
    skipSocial?: boolean;
    concurrency?: number;
    maxRetries?: number;
  };
}
```

**Output:**
```typescript
export interface EnrichmentRunResult {
  executionId: string;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  summary: {
    total: number;
    enriched: number;
    partiallyEnriched: number;
    failed: number;
    skipped: number;
    websiteFound: number;
    socialProfilesFound: number;
    socialProfilesVerified: number;
  };
  durationMs: number;
}
```

### 3.2 Orchestration Flow

```
1. Load SearchExecution by ID
   └─ Verify execution status is COMPLETED
   └─ Verify principal owns the execution (tenant isolation)

2. Load all SearchResults for the execution
   └─ Filter: enrichmentStatus = PENDING or ENRICHMENT_FAILED (retries)
   └─ Skip: enrichmentStatus = ENRICHED (idempotency)

3. Process results in batches (default concurrency: 5)
   For each SearchResult:
     a. Set enrichmentStatus = IN_PROGRESS

     b. Website enrichment (if websiteDomain present AND skipWebsite=false):
        ├─ Call WebsiteEnrichmentPort.enrich({ domain, timeoutMs })
        ├─ On success: store in snapshot.website
        ├─ On failure: record in snapshot.errors, continue
        └─ On timeout: record error, continue

     c. Social discovery (if skipSocial=false):
        ├─ Call SocialDiscoveryPort.discover({ domain, companyName, timeoutMs })
        ├─ For each discovered profile:
        │   ├─ Call SocialVerificationPort.verify({ platform, profileUrl, handle })
        │   ├─ On success: append to snapshot.social.profiles with verified=true
        │   └─ On failure: append with verified=false, continue
        ├─ On provider failure: record in snapshot.errors, continue
        └─ Deduplicate by platform+handle

     d. Determine enrichmentStatus:
        ├─ If website AND social succeeded → ENRICHED
        ├─ If only one succeeded → PARTIALLY_ENRICHED
        ├─ If both failed → ENRICHMENT_FAILED
        └─ If result had no websiteDomain and no social possible → SKIPPED

     e. Persist enrichmentSnapshot and enrichmentStatus on SearchResult

4. Update SearchExecution.metrics with enrichment counts
   └─ Add: enrichmentDurationMs, enrichedCount, socialProfilesFound, etc.

5. Return EnrichmentRunResult
```

### 3.3 Idempotency

- Results with `enrichmentStatus = ENRICHED` are skipped (already done)
- Re-running enrichment overwrites the snapshot (latest wins)
- Results with `enrichmentStatus = IN_PROGRESS` from a crashed run are
  reset to `PENDING` at the start of a new enrichment run (stale lock recovery)

### 3.4 Partial Failure

Partial failure is a first-class outcome, not an error:
- Each result is enriched independently
- Website failure does not block social discovery
- Social verification failure does not block other profiles
- Errors are recorded in `snapshot.errors`, not thrown
- The use-case returns `PARTIALLY_COMPLETED` status

### 3.5 Concurrency Control

- Process results in batches of configurable size (default: 5)
- Use `Promise.allSettled` for each batch
- Rate limiting: configurable delay between batches (default: 100ms)
- Provider-level rate limiting handled by adapters (see Section 6)

### 3.6 Repositories

```ts
// domain/ports/enrichment.repository.ts

export const EnrichmentRepository = Symbol('EnrichmentRepository');

export interface EnrichmentRepository {
  findResultsByExecutionId(executionId: string): Promise<EnrichmentResultRow[]>;
  updateEnrichmentStatus(
    searchResultId: string,
    status: EnrichmentStatus,
    snapshot: EnrichmentSnapshot | null,
  ): Promise<void>;
  resetStaleInProgress(executionId: string): Promise<number>;
  countByEnrichmentStatus(
    executionId: string,
  ): Promise<Record<EnrichmentStatus, number>>;
}

export interface EnrichmentResultRow {
  id: string;
  executionId: string;
  providerId: string;
  providerRecordId: string;
  companyName: string;
  websiteDomain: string | null;
  enrichmentStatus: EnrichmentStatus;
  enrichmentSnapshot: EnrichmentSnapshot | null;
}
```

This repository is implemented in `infrastructure/persistence/` and returns
domain-typed rows, never raw Prisma types.

---

## 4. SSRF Protection

### 4.1 UrlSafetyGuard Utility

**Location:** `backend/src/common/utils/url-safety.util.ts`

This is a pure utility (no NestJS imports) that validates URLs before fetching.

```ts
export interface UrlSafetyCheckResult {
  safe: boolean;
  reason?: string;
}

export interface UrlSafetyOptions {
  allowedSchemes?: string[];      // default: ['https']
  blockPrivateIps?: boolean;      // default: true
  blockReservedDomains?: boolean; // default: true
  maxUrlLength?: number;          // default: 2048
}
```

**Checks performed:**
1. **Scheme validation:** Only `https` by default (configurable)
2. **URL length:** Reject URLs exceeding `maxUrlLength`
3. **Private IP blocking:** Resolve hostname, reject if IP is in:
   - `127.0.0.0/8` (localhost)
   - `10.0.0.0/8` (private)
   - `172.16.0.0/12` (private)
   - `192.168.0.0/16` (private)
   - `169.254.0.0/16` (link-local)
   - `::1` (IPv6 localhost)
   - `fc00::/7` (IPv6 private)
4. **Reserved domain blocking:** Reject `localhost`, `*.local`, `*.internal`
5. **Redirect limit:** Max 3 redirects (enforced at fetch time, not in this utility)

### 4.2 SafeFetcher Utility

**Location:** `backend/src/common/utils/safe-fetcher.util.ts`

Wraps `fetch` with SSRF protection, timeout, redirect limits, and response size
limits.

```ts
export interface SafeFetchOptions {
  timeoutMs: number;          // required
  maxResponseBytes?: number;  // default: 1MB
  maxRedirects?: number;      // default: 3
  userAgent?: string;         // default: 'DigitalWave-Enrichment/1.0'
  urlSafety?: UrlSafetyOptions;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: string | null;
  redirected: boolean;
  finalUrl: string;
}
```

**Behavior:**
1. Validate URL via `UrlSafetyGuard` before fetching
2. Fetch with `AbortSignal.timeout()` for timeout
3. Follow redirects up to `maxRedirects` (track via redirect counter)
4. Re-validate each redirect target via `UrlSafetyGuard`
5. Read response body up to `maxResponseBytes`, then abort
6. Return structured result; throw `ServiceUnavailableException` on safety
   violations or network errors

### 4.3 Integration

Enrichment providers use `SafeFetcher` instead of raw `fetch`:

```ts
// In infrastructure/adapters/website-fetcher.adapter.ts
import { safeFetch } from '../../../../common/utils/safe-fetcher.util.js';

const result = await safeFetch(`https://${domain}`, {
  timeoutMs: this.options.timeoutMs,
  maxResponseBytes: 1_048_576,
});
```

---

## 5. API Design

### 5.1 Enrichment Endpoint

```
POST /api/v1/search/executions/:executionId/enrich
```

**Authentication:** Required (Bearer JWT)
**RBAC:** `MEMBER` or `ADMIN` role

### 5.2 Request DTO

```ts
// presentation/dto/enrich-request.dto.ts

export class EnrichRequestDto {
  @ApiProperty({ required: false, description: 'Skip website enrichment' })
  @IsOptional()
  @IsBoolean()
  skipWebsite?: boolean;

  @ApiProperty({ required: false, description: 'Skip social discovery' })
  @IsOptional()
  @IsBoolean()
  skipSocial?: boolean;

  @ApiProperty({ required: false, description: 'Max concurrent enrichments', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  concurrency?: number;

  @ApiProperty({ required: false, description: 'Max retries per result', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxRetries?: number;
}
```

### 5.3 Response DTO

```ts
// presentation/dto/enrich-result.dto.ts

export class EnrichSummaryDto {
  @ApiProperty({ example: 14 })
  total!: number;

  @ApiProperty({ example: 10 })
  enriched!: number;

  @ApiProperty({ example: 2 })
  partiallyEnriched!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 1 })
  skipped!: number;

  @ApiProperty({ example: 8 })
  websiteFound!: number;

  @ApiProperty({ example: 12 })
  socialProfilesFound!: number;

  @ApiProperty({ example: 10 })
  socialProfilesVerified!: number;
}

export class EnrichResponseDto {
  @ApiProperty({ example: 'execution-uuid' })
  executionId!: string;

  @ApiProperty({ example: 'COMPLETED', enum: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'] })
  status!: string;

  @ApiProperty({ type: EnrichSummaryDto })
  summary!: EnrichSummaryDto;

  @ApiProperty({ example: 5432 })
  durationMs!: number;

  static from(result: EnrichmentRunResult): EnrichResponseDto { ... }
}
```

### 5.4 Status Transitions

```
Execution status must be COMPLETED before enrichment can start.
Enrichment runs asynchronously within the request:
  CREATED → (enrichment starts) → enrichmentStatus on results changes
  POST response returns when all results are processed

SearchResult enrichmentStatus transitions:
  PENDING → IN_PROGRESS → ENRICHED | PARTIALLY_ENRICHED | ENRICHMENT_FAILED | SKIPPED
  ENRICHMENT_FAILED → IN_PROGRESS → ENRICHED | ... (retry)
  ENRICHED → IN_PROGRESS → ENRICHED (re-enrichment, overwrite)
```

### 5.5 Error Handling

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Execution not found | 404 | `RESOURCE_NOT_FOUND` |
| Execution not completed yet | 422 | `BUSINESS_RULE_VIOLATION` |
| Execution belongs to another user | 403 | `FORBIDDEN` |
| Enrichment provider unavailable | 200 | (partial success, recorded in errors) |
| Request validation failed | 400 | `VALIDATION_ERROR` |

**Important:** Enrichment provider failures do NOT fail the API request. They
are recorded as partial failures in the enrichment snapshot. The endpoint returns
200 with `PARTIALLY_COMPLETED` status.

### 5.6 Controller

```ts
// presentation/controllers/enrich.controller.ts

@ApiTags('enrichment')
@Controller('search/executions')
export class EnrichController {
  constructor(private readonly enrichUseCase: EnrichSearchResultsUseCase) {}

  @Post(':executionId/enrich')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enrich search results with website and social data' })
  @ApiOkResponse({ type: EnrichResponseDto })
  async enrich(
    @CurrentUser() user: AuthPrincipal,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() dto: EnrichRequestDto,
  ): Promise<EnrichResponseDto> {
    const result = await this.enrichUseCase.execute({
      executionId,
      principal: user,
      options: dto,
    });
    return EnrichResponseDto.from(result);
  }
}
```

### 5.7 Module Wiring

The `EnrichController` is added to `SearchModule`:

```ts
@Module({
  controllers: [SearchController, RunController, EnrichController],
  providers: [
    // ... existing providers ...
    {
      provide: WebsiteEnrichmentPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWebsiteEnrichmentProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    {
      provide: SocialDiscoveryPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSocialDiscoveryProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    {
      provide: SocialVerificationPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSocialVerificationProvider(config.getOrThrow<AppConfig['enrichment']>('enrichment')),
    },
    { provide: EnrichmentRepository, useClass: PrismaEnrichmentRepository },
    EnrichSearchResultsUseCase,
  ],
})
export class SearchModule {}
```

---

## 6. Implementation Phases

### D1: Website Enrichment (Metadata Extraction)

**Files to create:**
- `domain/ports/website-enrichment.port.ts`
- `domain/entities/enrichment-snapshot.ts`
- `infrastructure/adapters/http-website-enrichment.provider.ts`
- `infrastructure/adapters/http-website-enrichment.provider.spec.ts`
- `application/use-cases/enrich-search-results.usecase.ts` (stub, website only)
- `application/use-cases/enrich-search-results.usecase.spec.ts`

**Schema migration:**
- Add `EnrichmentStatus` enum
- Add `enrichmentStatus`, `enrichmentSnapshot`, `enrichedAt` to SearchResult
- Add index on `enrichmentStatus`

**Implementation details:**
- HTTP adapter uses `SafeFetcher` to fetch the homepage
- Parses HTML for `<title>`, `<meta name="description">`, `<meta property="og:*">`
- Detects tech hints via script src patterns, meta generator tags, header analysis
- Extracts social links from `<a>` tags matching known social domains
- Pure HTML parsing (no headless browser)

**Test cases:**
1. Website with title + description + social links → full snapshot
2. Website with only title → partial snapshot (description null)
3. Website unreachable → error recorded, not thrown
4. Website returns non-HTML (PDF, image) → SKIPPED
5. SSRF: localhost URL → rejected by UrlSafetyGuard
6. SSRF: private IP URL → rejected by UrlSafetyGuard
7. SSRF: HTTP URL when only HTTPS allowed → rejected
8. Timeout → error recorded
9. Large response (>1MB) → truncated, partial data extracted
10. Redirect chain (>3 hops) → stopped, last valid response used

### D2: Social Discovery (Find Social Profiles)

**Files to create:**
- `domain/ports/social-discovery.port.ts`
- `infrastructure/adapters/http-social-discovery.provider.ts`
- `infrastructure/adapters/http-social-discovery.provider.spec.ts`

**Implementation details:**
- Provider scans the website HTML for social profile links
- Matches URLs against known social platform patterns:
  - `facebook.com/*`, `instagram.com/*`, `linkedin.com/*`,
    `twitter.com/*`, `x.com/*`, `youtube.com/*`, `tiktok.com/*`
- Extracts handle from URL path
- Assigns confidence based on link placement (footer > sidebar > content)
- Deduplicates by platform + handle

**Test cases:**
1. Website with 3 social links → 3 profiles discovered
2. Website with no social links → empty array
3. Duplicate links to same profile → deduplicated
4. Invalid social URL → skipped (not thrown)
5. Provider timeout → error recorded, empty result
6. Company name fallback (no website) → search-based discovery
7. Confidence scoring: footer link = 0.9, content link = 0.7, meta tag = 0.8

### D3: Social Verification (Confirm Profiles Exist)

**Files to create:**
- `domain/ports/social-verification.port.ts`
- `infrastructure/adapters/http-social-verification.provider.ts`
- `infrastructure/adapters/http-social-verification.provider.spec.ts`

**Implementation details:**
- Fetches the social profile URL with SafeFetcher
- Checks HTTP status: 200 = exists, 404 = not found, 403 = exists but blocked
- Extracts display name from page title or meta tags
- Detects suspension/deactivation pages via content patterns
- Returns lightweight evidence (no full page scraping)

**Test cases:**
1. Active profile → `{ exists: true, active: true, displayName: "..." }`
2. Suspended profile → `{ exists: true, active: false }`
3. 404 profile → `{ exists: false, active: false }`
4. Rate limited (429) → retry with backoff, then record error
5. Private profile → `{ exists: true, active: true }` (exists but limited)
6. Platform timeout → error recorded, profile marked unverified
7. SSRF: malicious profile URL → rejected

### D4: Enrichment Orchestration (Tie It All Together)

**Files to create:**
- `domain/ports/enrichment.repository.ts`
- `infrastructure/persistence/prisma-enrichment.repository.ts`
- `infrastructure/persistence/prisma-enrichment.repository.spec.ts`
- `application/use-cases/enrich-search-results.usecase.ts` (full implementation)
- `application/use-cases/enrich-search-results.usecase.spec.ts`
- `presentation/controllers/enrich.controller.ts`
- `presentation/controllers/enrich.controller.spec.ts`
- `presentation/dto/enrich-request.dto.ts`
- `presentation/dto/enrich-result.dto.ts`

**Implementation details:**
- Orchestrates website + social enrichment per result
- Handles concurrency, batching, partial failure
- Updates SearchResult.enrichmentStatus and enrichmentSnapshot
- Updates SearchExecution.metrics with enrichment counts
- Implements stale lock recovery for IN_PROGRESS results
- Tenant isolation: verifies execution ownership before enrichment

**Test cases:**
1. Enrich 3 results → all enriched, summary correct
2. One result fails website enrichment → PARTIALLY_ENRICHED for that result
3. All results fail → ENRICHMENT_FAILED, endpoint returns 200 with summary
4. Re-run enrichment → overwrites previous snapshots (idempotent)
5. Execution not completed → 422 error
6. Execution belongs to another user → 403
7. Execution not found → 404
8. Stale IN_PROGRESS results → reset to PENDING before enrichment
9. Concurrency limit respected (no more than N parallel fetches)
10. Metrics updated correctly on SearchExecution

### D5: Qualification Update (Re-qualify with Enrichment Data)

**Files to modify:**
- `application/services/qualification-filter.ts` (extend, not replace)

**Implementation details:**
- New function `requalifyWithEnrichment()` that takes a `QualifiedResult` and
  its `EnrichmentSnapshot` and produces an updated `ResultQualification`
- Social criteria resolution:
  - `social: 'PRESENT'` + enrichment found verified social → `QUALIFIED`
  - `social: 'PRESENT'` + enrichment found unverified social → `UNVERIFIED_SOCIAL`
  - `social: 'PRESENT'` + no social found → `REJECTED`
  - `social: 'ABSENT'` + enrichment found social → `REJECTED`
  - `social: 'ABSENT'` + no social found → `QUALIFIED`
  - `social: 'ANY'` → always `QUALIFIED` (unchanged)
- Website criteria: unchanged (already resolved in Phase C)
- Source field updated to reflect enrichment provider

**Test cases:**
1. Social PRESENT + verified profile found → QUALIFIED
2. Social PRESENT + unverified profile found → UNVERIFIED_SOCIAL
3. Social PRESENT + no profiles found → REJECTED
4. Social ABSENT + profiles found → REJECTED
5. Social ABSENT + no profiles found → QUALIFIED
6. Social ANY → always QUALIFIED regardless of enrichment
7. Mixed results: some enriched, some not → correct per-result qualification
8. Enrichment snapshot missing social data → treated as "not found"
9. Multiple platforms: at least one verified → QUALIFIED for PRESENT

---

## 7. Test Plan

### 7.1 Unit Tests (per sub-phase)

**D1 — Website Enrichment:**
- `http-website-enrichment.provider.spec.ts` (10 cases)
- `enrich-search-results.usecase.spec.ts` (website-only subset, 5 cases)

**D2 — Social Discovery:**
- `http-social-discovery.provider.spec.ts` (7 cases)

**D3 — Social Verification:**
- `http-social-verification.provider.spec.ts` (7 cases)

**D4 — Orchestration:**
- `enrich-search-results.usecase.spec.ts` (full, 10 cases)
- `enrich.controller.spec.ts` (5 cases)
- `prisma-enrichment.repository.spec.ts` (6 cases)

**D5 — Re-qualification:**
- `qualification-filter.spec.ts` (extend with 9 new cases)

**SSRF Protection:**
- `url-safety.util.spec.ts` (8 cases)
- `safe-fetcher.util.spec.ts` (6 cases)

### 7.2 Test Patterns

All tests follow the existing pattern:

```ts
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Stub ports, inject into use-case, assert outcomes
// No DB connection, no NestJS test module
```

Provider tests stub `fetch` via constructor injection (same as
`GooglePlacesProvider`):

```ts
const mockFetch = async (): Promise<Response> => ({
  ok: true,
  status: 200,
  json: async () => ({ ... }),
  text: async () => '<html>...</html>',
} as Response);

const provider = new HttpWebsiteEnrichmentProvider(
  { timeoutMs: 5000 },
  mockFetch as typeof fetch,
);
```

### 7.3 Total Estimated Tests

| Sub-phase | Unit tests | Integration tests |
|-----------|-----------|-------------------|
| D1 | 15 | 0 |
| D2 | 7 | 0 |
| D3 | 7 | 0 |
| D4 | 21 | 0 |
| D5 | 9 | 0 |
| SSRF | 14 | 0 |
| **Total** | **73** | **0** |

No integration tests in Phase D — all tests are unit tests with stubbed ports,
consistent with the existing test strategy.

---

## 8. Environment Variables

Add to `config/configuration.ts` and `config/env.validation.ts`:

```typescript
// configuration.ts — extend AppConfig
enrichment: {
  websiteTimeoutMs: number;
  socialTimeoutMs: number;
  verificationTimeoutMs: number;
  maxConcurrentEnrichments: number;
  maxResponseBytes: number;
  maxRedirects: number;
  enabled: boolean;
};
```

```bash
# .env.example additions

# Enrichment provider settings
ENRICHMENT_ENABLED=true
ENRICHMENT_WEBSITE_TIMEOUT_MS=5000
ENRICHMENT_SOCIAL_TIMEOUT_MS=5000
ENRICHMENT_VERIFICATION_TIMEOUT_MS=3000
ENRICHMENT_MAX_CONCURRENT=5
ENRICHMENT_MAX_RESPONSE_BYTES=1048576
ENRICHMENT_MAX_REDIRECTS=3
```

**Validation rules:**
- `ENRICHMENT_ENABLED`: boolean, default `true`
- All timeout values: integer ≥ 1000
- `ENRICHMENT_MAX_CONCURRENT`: integer, 1–10
- `ENRICHMENT_MAX_RESPONSE_BYTES`: integer, 1024–10_485_760 (10MB max)
- `ENRICHMENT_MAX_REDIRECTS`: integer, 0–10

---

## 9. Risks and Tradeoffs

### 9.1 Key Decisions

| Decision | Choice | Tradeoff |
|----------|--------|----------|
| Storage: snapshot on SearchResult vs. new table | Snapshot (Json field) | Simpler schema, but enrichment data is not independently queryable. Acceptable for Phase D; can migrate to a table later if querying enrichment data becomes a requirement. |
| Promotion to canonical tables | Deferred to lead save | Enrichment data stays ephemeral. Leads get canonical Website/SocialProfile records. Delays canonical data creation but keeps enrichment reversible. |
| SSRF protection: DNS resolution at check time vs. at fetch time | Both (check + re-check after redirects) | Slightly slower but prevents DNS rebinding attacks. |
| Social verification: headless browser vs. HTTP check | HTTP check only | Lower resource usage, but cannot detect JS-rendered profiles. Sufficient for Phase D; headless browser can be added later. |
| Concurrency model: worker queue vs. in-process batching | In-process batching | Simpler, no new infrastructure. Adequate for <100 results per execution. Worker queue needed if enrichment scales to thousands of results. |

### 9.2 Risks

1. **HTML parsing fragility:** Website metadata extraction depends on HTML structure. Sites with non-standard markup may produce incomplete snapshots. Mitigation: graceful degradation, record partial data.

2. **Social platform rate limiting:** Aggressive crawling of social profile URLs may trigger rate limits. Mitigation: configurable concurrency, `user-agent` identification, backoff on 429.

3. **DNS rebinding:** A malicious domain could resolve to a private IP after initial validation. Mitigation: re-resolve hostname after each redirect, validate IP at fetch time.

4. **Stale enrichment data:** Enrichment snapshots are point-in-time. A website's metadata may change. Mitigation: `enrichedAt` timestamp, re-enrichment capability.

5. **No headless browser:** Cannot extract data from JS-heavy SPAs. Mitigation: Phase D is HTTP-only; headless browser can be added as a future provider without changing ports.

### 9.3 What We Gain

- `UNVERIFIED_SOCIAL` results can now be resolved to `QUALIFIED` or `REJECTED`
- Website metadata provides technology hints for lead scoring
- Social profiles enable outreach channel selection
- Enrichment evidence is auditable via snapshots

---

## 10. What Should NOT Be Built Yet

### 10.1 Deferred to Phase E

- **Lead-level enrichment:** Enrichment on saved Leads (not search results)
- **Company creation from enrichment:** Auto-creating Company records from enrichment data
- **Enrichment scheduling:** Cron-based re-enrichment of stale data
- **Enrichment analytics dashboard:** UI for enrichment metrics and coverage

### 10.2 Deferred to Future Phases

- **Headless browser enrichment:** For JS-heavy sites (requires Puppeteer/Playwright)
- **Email verification:** SMTP-based email existence checking
- **Phone verification:** SMS/call-based phone number validation
- **Business hours extraction:** Scraping opening hours from websites
- **Review sentiment analysis:** NLP on review text
- **Financial data enrichment:** Company registration, revenue data
- **Competitor analysis enrichment:** Market positioning data
- **Bulk enrichment API:** Enrich multiple executions in one call
- **Webhook notifications:** Async enrichment completion callbacks
- **Enrichment cost tracking:** Per-provider cost attribution

### 10.3 Explicitly Out of Scope

- **Real-time enrichment:** Enrichment happens post-discovery, not inline
- **Third-party enrichment providers:** Phase D uses self-built HTTP adapters
- **Enrichment caching:** No cross-result caching (each result enriched independently)
- **Enrichment deduplication across executions:** Each execution enriched independently

---

## Appendix A: File Tree

```
backend/src/
├── common/
│   └── utils/
│       ├── url-safety.util.ts           (NEW — D1)
│       ├── url-safety.util.spec.ts      (NEW — D1)
│       ├── safe-fetcher.util.ts         (NEW — D1)
│       └── safe-fetcher.util.spec.ts    (NEW — D1)
├── config/
│   ├── configuration.ts                 (MODIFY — add enrichment config)
│   └── env.validation.ts                (MODIFY — add enrichment validation)
└── modules/search/
    ├── domain/
    │   ├── entities/
    │   │   └── enrichment-snapshot.ts   (NEW — D1)
    │   └── ports/
    │       ├── website-enrichment.port.ts    (NEW — D1)
    │       ├── social-discovery.port.ts      (NEW — D2)
    │       ├── social-verification.port.ts   (NEW — D3)
    │       └── enrichment.repository.ts      (NEW — D4)
    ├── application/
    │   ├── services/
    │   │   ├── qualification-filter.ts       (MODIFY — D5: add requalifyWithEnrichment)
    │   │   └── qualification-filter.spec.ts  (MODIFY — D5: add 9 test cases)
    │   └── use-cases/
    │       └── enrich-search-results.usecase.ts       (NEW — D4)
    │       └── enrich-search-results.usecase.spec.ts  (NEW — D4)
    ├── infrastructure/
    │   ├── adapters/
    │   │   ├── http-website-enrichment.provider.ts       (NEW — D1)
    │   │   ├── http-website-enrichment.provider.spec.ts  (NEW — D1)
    │   │   ├── http-social-discovery.provider.ts         (NEW — D2)
    │   │   ├── http-social-discovery.provider.spec.ts    (NEW — D2)
    │   │   ├── http-social-verification.provider.ts      (NEW — D3)
    │   │   └── http-social-verification.provider.spec.ts (NEW — D3)
    │   └── persistence/
    │       ├── prisma-enrichment.repository.ts       (NEW — D4)
    │       └── prisma-enrichment.repository.spec.ts  (NEW — D4)
    ├── presentation/
    │   ├── controllers/
    │   │   ├── enrich.controller.ts       (NEW — D4)
    │   │   └── enrich.controller.spec.ts  (NEW — D4)
    │   └── dto/
    │       ├── enrich-request.dto.ts      (NEW — D4)
    │       └── enrich-result.dto.ts       (NEW — D4)
    └── search.module.ts                   (MODIFY — D4: wire enrichment providers)
```

## Appendix B: Error Codes

Add to `common/exceptions/error-codes.ts`:

```typescript
export const ErrorCode = {
  // ... existing codes ...
  ENRICHMENT_PROVIDER_UNAVAILABLE: 'ENRICHMENT_PROVIDER_UNAVAILABLE',
  ENRICHMENT_NOT_ALLOWED: 'ENRICHMENT_NOT_ALLOWED',
  ENRICHMENT_TARGET_NOT_READY: 'ENRICHMENT_TARGET_NOT_READY',
} as const;
```

## Appendix C: Migration SQL

```sql
-- Generated by prisma migrate dev — Phase D enrichment

CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ENRICHED', 'PARTIALLY_ENRICHED', 'ENRICHMENT_FAILED', 'SKIPPED');

ALTER TABLE "search_results" ADD COLUMN "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "search_results" ADD COLUMN "enrichment_snapshot" JSONB;
ALTER TABLE "search_results" ADD COLUMN "enriched_at" TIMESTAMPTZ;

CREATE INDEX "idx_search_results_enrichment_status" ON "search_results"("enrichment_status");
CREATE INDEX "idx_search_results_execution_enrichment" ON "search_results"("execution_id", "enrichment_status");
```
