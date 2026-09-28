# Digital Wave Sales Intelligence — Full System Audit Report

**Date:** 2026-08-18
**Git HEAD:** `a0db7c3` (main) + uncommitted E1–E4 working tree changes
**Production URL:** `https://digital-wave-sales-intelligence-jd5336k77-digital-wave-team.vercel.app`
**Backend tests:** 476/476 passing | **Frontend:** builds clean, lint clean
**Scope:** Read-only audit — codebase, infrastructure, documentation, pipeline status

---

## 1. Executive Summary

**Digital Wave Sales Intelligence** is an Arabic-language lead discovery platform that finds businesses via Google Places, qualifies them with deterministic rules, enriches them with website/social data through HTTP scraping, and presents results in a React dashboard.

| Metric | Value |
|---|---|
| Hand-written source files | 109 (.ts/.tsx) |
| Prisma schema models | 40 (11 actively used, 29 orphaned design references) |
| Active migrations | 4 |
| HTTP endpoints | 16 across 7 controllers |
| Frontend components | 12 |
| API client modules | 8 |
| Backend tests | 476 (all unit/mocked, zero integration/E2E) |
| Frontend tests | 0 |
| AI/ML code | 0 (design docs only) |
| Empty scaffold modules | 12 of 14 modules (0-byte .module.ts) |

**Verdict:** The system is a functioning end-to-end lead discovery pipeline with real Google Places integration, real HTTP-based enrichment, real JWT auth, and a real Arabic UI. It is production-deployed on Vercel with a Supabase Postgres backend. However, it has significant structural debt: 12 dead module scaffolds, 29 orphaned Prisma models, zero integration tests, stale documentation claims, and the AI system (the product's core differentiator) exists only as design documents.

---

## 2. Tech Stack

### Frontend
| Component | Version | Notes |
|---|---|---|
| React | 19.1.0 | With hooks, no class components |
| Vite | 8.1.4 | Build tool, SWC transpiler |
| TypeScript | 6.3.3 | Strict mode, `noUnusedLocals`, `noUnusedParameters` |
| ESLint | 9.32.0 | + `@eslint/js` + `typescript-eslint` |
| oxlint | 3.28.5 | Additional linter |
| oxfmt | 3.28.5 | Formatter (Prettier-equivalent) |
| State management | None | Plain `useState`/`useCallback`, prop drilling |
| Router | None | Manual `window.history.pushState` + hash-based routing |
| HTTP client | Custom | `requestJson()` with auth refresh, no axios/fetch wrapper library |
| CSS | Vanilla | No CSS-in-JS, no Tailwind, no component library |

### Backend
| Component | Version | Notes |
|---|---|---|
| NestJS | 11.1.4 | With Express adapter |
| Prisma | 7.12.1 | + `@prisma/extension-safe-query` |
| Node.js | >=20 | |
| express | 5.1.0 | |
| class-validator | 0.14.1 | DTO validation |
| class-transformer | 0.5.1 | DTO transformation |
| @nestjs/throttler | 6.4.1 | Rate limiting (global guard) |
| argon2 | 0.43.1 | Password hashing |
| jsonwebtoken | 9.0.2 | JWT tokens |
| dotenv-flow | 0.4.2 | Multi-env config |

### Infrastructure
| Component | Details |
|---|---|
| Hosting | Vercel (serverless) |
| Database | Supabase PostgreSQL 15.8 |
| ORM | Prisma 7 with driver adapter (PrismaPg) |
| Environment | `.env` (gitignored), `.env.example` template |
| CI/CD | Vercel Git integration (push to main → deploy) |

### Key Architectural Decisions
- **Single `package.json`** — no monorepo, no workspaces
- **`type: module`** — ESM throughout
- **NodeNext module resolution** — all relative imports use `.js` extension in `.ts` source
- **Schema-first Prisma** — edit `prisma/schema.prisma`, generate migrations via `migrate dev`
- **Port/Adapter architecture** — domain defines interfaces, infrastructure implements them
- **No `db push`** — only `migrate dev` / `migrate deploy`

---

## 3. End-to-End Request Flow

### Flow A: Search (discovery)
```
Frontend: POST /api/v1/search { query: "مطاعم في تونس", filters: {...} }
  → SearchController.search()
    → SearchUseCase.execute()
      → TranslateArabicIntentUseCase.translateArabicIntent(query) — deterministic rules, no AI
        → Returns SearchIntentCriteria { query, governorate, category, minRating, keywords }
      → GooglePlacesAdapter.searchPlaces(criteria)
        → POST https://places.googleapis.com/v1/places:searchText
          → Field mask: id, displayName, formattedAddress, nationalPhoneNumber, websiteUri, rating, userRatingCount, googleMapsUri, types
        → Max 60 results (3 pages × 20)
        → Returns NormalizedSearchResult[]
      → QualificationFilter.qualifyResults(results, criteria)
        → Checks website presence (ANY/PRESENT/ABSENT)
        → Social: always UNVERIFIED_SOCIAL (can't verify during discovery)
        → Returns QualifiedResult[] with signals + status
      → SearchRepository.saveSearch() — persists SearchJob → SearchExecution → SearchResults
    → Returns { executionId, results[], summary }
  → Frontend: stores executionId, displays result grid
```

### Flow B: Enrichment (execution-level)
```
Frontend: POST /api/v1/search/executions/:id/enrich
  → EnrichController.enrichExecution()
    → EnrichSearchResultsUseCase.execute()
      → ExecutionEnrichmentProvider.execute(executionId, userId)
        → Fetches all search results for this execution
        → For each result with website URL:
          → EnrichmentEngine.enrichSingleTarget({ websiteDomain, companyName })
            → WebsiteEnrichmentProvider.enrich(website)
              → HTTP GET (with timeout 10s, SSRF filter)
              → Parses HTML: meta tags, title, tech stack, language, OG tags
            → SocialDiscoveryProvider.discover(website)
              → Follows robots.txt (10 page max crawl)
              → Finds social links via: robots.txt, homepage, footer
              → HTTP HEAD verification of each discovered link
            → Returns { website, social[] }
          → Saves enrichment snapshot to SearchResult.enrichmentSnapshot
          → Recomputes qualification via requalifyWithEnrichment()
        → Returns enriched results
    → Returns results with enrichment data
```

### Flow C: Save Lead
```
Frontend: POST /api/v1/leads { query, providerResultId, filters, resultIndex, result }
  → LeadsController.saveLead()
    → SaveLeadUseCase.execute()
      → Checks idempotency (userId + providerRecordId → existing lead)
      → Creates Lead record with copied snapshot
      → Lead.enrichmentStatus = ENRICHED (if snapshot exists)
    → Returns SavedLead
```

### Flow D: Re-enrich Lead
```
Frontend: POST /api/v1/leads/:id/enrich
  → LeadsController.enrichLead()
    → EnrichLeadUseCase.execute()
      → Atomic claim: UPDATE leads SET status='IN_PROGRESS' WHERE id=:id AND userId=:userId
        → Concurrency guard: only if status != 'IN_PROGRESS' OR stale (>10 min)
      → Fetches lead by ID
      → EnrichmentEngine.enrichSingleTarget({ websiteDomain, companyName })
      → Persists new snapshot to lead.enrichmentSnapshot
      → Recomputes qualification via requalifyWithEnrichment()
      → Updates status to ENRICHED
    → Returns { leadId, enrichment: EnrichmentView, durationMs }
```

---

## 4. Google Places Integration — Deep Audit

### Provider Location
`backend/src/modules/search/infrastructure/providers/google-places/google-places.provider.ts`

### Request Details
- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`
- **Auth:** `X-Goog-Api-Key: ${process.env.GOOGLE_PLACES_API_KEY}` (header-based)
- **Field mask:** `places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.types`
- **Pagination:** `nextPageToken` → max 3 pages (20 results/page = 60 max)
- **Rate limiting:** 500ms delay between pagination requests (internal)
- **Error handling:** Returns `SearchPortError` on failure, catches exceptions and re-throws

### Strengths
- Field mask correctly restricts data transfer
- Pagination with delay to avoid rate limits
- Language preference `ar` for Arabic results
- Proper timeout handling (10s)

### Weaknesses
- **No retry logic** — single API failure → entire search fails
- **No fallback** — if Google Places is down, nothing works
- **No caching** — same query → fresh API call every time
- **No cost tracking** — no logging of API quota consumption
- **Hardcoded max 60 results** — no user-configurable limit
- **No API key rotation** — single key from env
- **No request logging/metrics** — zero observability for API calls
- **`fields` parameter in wrong format** — uses POST body `fields` array, but Google Places Text Search uses `fieldMask` header (this works because it's `searchText` endpoint v1 which accepts `fieldMask` in the request body)

### Mapping Accuracy
Google Places `displayName.text` is used as `companyName` — this is the display name in the language the Places API returns it (which may not always be Arabic despite `languageCode: 'ar'`).

---

## 5. Search Domain

### Model Relationships
```
SearchJob (1) ──→ (N) SearchExecution
SearchExecution (1) ──→ (N) SearchResult
SearchExecution (1) ──→ (N) RawImport
```

### Key Fields

**SearchJob** (`search_jobs` table)
- `id`, `query`, `filters` (JSONB), `userId` (FK → users)
- `createdAt`, `updatedAt`, `deletedAt`

**SearchExecution** (`search_executions` table)
- `id`, `jobId` (FK → search_jobs), `status` (enum)
- `startedAt`, `completedAt`, `durationMs`
- `resultCount`, `qualifiedCount`, `rejectedCount`
- `enrichmentStatus`, `enrichmentStartedAt`, `enrichmentCompletedAt`

**SearchResult** (`search_results` table)
- `id`, `executionId` (FK → search_executions), `index`
- `providerRecordId` (Google Places ID — used as dedup key per user)
- `companyName`, `formattedAddress`, `nationalPhoneNumber`, `websiteUri`
- `rating`, `userRatingCount`, `googleMapsUri`, `types` (JSONB)
- `qualificationStatus`, `qualificationReason`, `qualificationWebsite`, `qualificationSocial` (JSONB)
- `enrichmentSnapshot` (JSONB), `enrichmentStatus`
- `savedAt`, `leadId`

**RawImport** (`raw_imports` table)
- `id`, `executionId`, `source`, `payload` (JSONB), `recordCount`
- Used for audit trail, **not used for enrichment**

### Deduplication
- **Per-user, per-provider:** `providerRecordId` + `userId` → unique Lead
- **Across searches:** None. Same business found in two different searches → two different SearchResult rows
- **Across users:** None. Two users can save the same business as separate leads

---

## 6. Entity Resolution

### Current State: **NOT IMPLEMENTED**

- `companies` table exists in schema but has **zero usage** in code
- No entity matching, clustering, or deduplication logic
- `SearchResult.companyName` is the raw Google Places display name — no normalization
- No fuzzy matching across results
- No canonical company record

### Impact
- Duplicate leads possible across searches and users
- No company-level analytics
- Cannot track "this business appears in N searches"

---

## 7. Evidence System

### Current State: **MINIMAL — audit trail only**

- `RawImport` records are created during search execution with `source: 'GOOGLE_PLACES'` and `payload: <raw API response>`
- `RawImport` is **never queried** during enrichment — enrichment hits live websites
- `raw_imports` table is append-only (no reads in application code)
- `raw_import_records` table exists in schema but is **never used**

### Design Gap
The evidence system was designed to store and replay provider responses for offline analysis and audit. Currently it's a write-only sink. The `RawImport.payload` contains useful data (all Google Places response fields) but nothing reads it.

---

## 8. Enrichment Engine

### Architecture
Three port interfaces, three HTTP adapter implementations:

```
WebsiteEnrichmentPort ──→ WebsiteEnrichmentProvider (HTTP scraping)
SocialDiscoveryPort ──→ SocialDiscoveryProvider (HTTP link discovery)
SocialVerificationPort ──→ SocialVerificationProvider (HTTP HEAD checks)
```

**EnrichmentEngine** (shared service, `backend/src/modules/search/application/services/enrichment-engine.ts`)
- Orchestrates all three ports
- Accepts `{ websiteDomain, companyName }` target
- Returns `{ status, snapshot, websiteFound, socialProfilesFound, socialProfilesVerified }`
- Pure domain service — no Prisma/NestJS imports

### Website Enrichment (`WebsiteEnrichmentProvider`)
- **Method:** HTTP GET with 10s timeout
- **Data extracted:** title, description, language, tech hints (meta generator, script sources, link hrefs), OG tags (title, description, image)
- **SSRF protection:** Blocks localhost, private IPs, cloud metadata endpoints
- **robots.txt compliance:** Checks disallow rules before fetching
- **Max body read:** 1MB, 10s timeout
- **Output:** `{ status, title, description, language, ogTitle, ogDescription, ogImage, techHints[], links: { rel, href, type }[] }`

### Social Discovery (`SocialDiscoveryProvider`)
- **Method:** HTTP GET (robots.txt + homepage + footer pages)
- **Crawl depth:** Max 10 pages from website root
- **Discovery sources:** robots.txt sitemap links, homepage HTML, footer HTML
- **Pattern matching:** Regex for 12 platforms: facebook, instagram, twitter/x, linkedin, youtube, tiktok, snapchat, pinterest, github, whatsapp, telegram, email
- **SSRF protection:** Same as website enrichment
- **Output:** `{ platform, url, confidence, placement }[]` — confidence based on HTML location (robots.txt > footer > homepage)

### Social Verification (`SocialVerificationProvider`)
- **Method:** HTTP HEAD (with GET fallback)
- **Retry:** Up to 3 attempts with 1s delay
- **Verification criteria:** HTTP status < 400, not login/consent page
- **Output:** `{ verified: boolean }` per social profile

### Strengths
- Clean port/adapter separation — easy to swap implementations
- Shared engine reused across search enrichment and lead re-enrichment
- SSRF protection prevents internal network access
- robots.txt compliance respects site policies
- Confidence scoring for social discovery quality

### Weaknesses
- **No caching** — re-enriching the same lead hits the same websites
- **No rate limiting** — could overwhelm target websites
- **No concurrent request limiting** — could hit connection limits
- **No content size limits** beyond 1MB body read
- **No structured data extraction** — no JSON-LD, no microdata parsing
- **No error differentiation** — timeout vs 404 vs 500 all treated as "not found"
- **12-platform regex** — no support for Arabic-specific platforms (e.g., Anghami, Talabat)

---

## 9. Social / Digital Presence

### Social Profile Model
```typescript
interface SocialProfile {
  platform: string;        // 'facebook', 'instagram', etc.
  url: string;             // Full URL
  confidence: number;      // 0-1, based on discovery source
  placement: string;       // 'robots.txt' | 'footer' | 'homepage' | 'sitemap'
  verified: boolean;       // HTTP HEAD check result
  handle?: string;         // Extracted from URL path
  error?: string;          // Verification error message
}
```

### Enrichment View (frontend-facing)
```typescript
interface EnrichmentView {
  status: EnrichmentStatus;
  enrichedAt: string;
  website: {
    title: string;
    description: string;
    language: string;
    ogImage?: string;
    techHints: string[];
    socialLinks: string[];
  };
  social: {
    platform: string;
    handle: string;
    verified: boolean;
    profileUrl: string;
  }[];
}
```

### Current Gaps
- No social media content scraping (only link discovery)
- No follower/post counts
- No social media posting history
- No Arabic platform support (Arabic social media ecosystem is different)
- Verification is HTTP-level only — doesn't check if the profile is active
- `handle` extraction is basic (URL path splitting)

---

## 10. AI System

### Current State: **ZERO CODE — design docs only**

**Files referencing AI:**
- `docs/handoff/AI_PRODUCT_SPEC.md` — Full AI/Gemini design spec (NOT implemented)
- `docs/handoff/PROJECT_HANDOFF.md` — "AI/Gemini: nothing. No AI code, no provider SDK, only design docs."
- `docs/handoff/ROADMAP_CURRENT.md` — Phase E = "AI business understanding (Gemini)"
- `docs/handoff/IMPLEMENTATION_STATUS.md` — AI = `NOT STARTED`
- `docs/ERROR_HANDLING.md` — Defines `AI_PROVIDER_UNAVAILABLE` error code for future use
- `docs/NAMING_CONVENTIONS.md` — Lists `AI_` as an env prefix convention
- `docs/PHASE_E_LEAD_INTELLIGENCE_SPEC.md` — "AI/Gemini is NOT part of Phase E (next phase)"

**What exists in code:**
- `backend/src/modules/ai/ai.module.ts` — **Empty file** (0 bytes)
- No Gemini SDK, no OpenAI SDK, no LLM integration
- No prompt templates, no RAG pipeline
- No embeddings, no vector store

**What the design specs propose:**
- Provider: Google Gemini (owner has Gemini Pro subscription)
- Use cases: Query intent parsing, lead scoring, activity analysis, data validation, duplicate detection
- Architecture: `AiProviderPort` → `GeminiAiAdapter` (abstracted, swappable)
- Each AI use case should be isolated and recoverable

**Assessment:** The AI system is the product's core differentiator (per the business plan). It is completely unbuilt. The deterministic `translateArabicIntent()` is the current "intelligence" — it works but has no learning, no context, and no adaptability.

---

## 11. Qualification System

### Architecture
Pure domain logic, zero infrastructure dependencies:

1. **`qualifyResults(results, criteria)`** — First-pass qualification during discovery
   - Checks website presence against criteria (ANY/PRESENT/ABSENT)
   - Social: always `UNVERIFIED_SOCIAL` (can't verify during discovery)
   - Returns `QualifiedResult[]` with signals + status

2. **`requalifyWithEnrichment(result, snapshot)`** — Post-enrichment re-evaluation
   - Only called when `snapshot` has a `social` section
   - Social PRESENT + verified profile → QUALIFIED
   - Social PRESENT + unverified profile → UNVERIFIED_SOCIAL
   - Social PRESENT + no profiles → REJECTED
   - Social ABSENT + profiles exist → REJECTED
   - Social ANY → passes through unchanged

3. **`computeQualification(row, criteria)`** — Convenience function for read-time recomputation
   - Normalizes DB row → `NormalizedSearchResult`
   - Runs `qualifyResults` → runs `requalifyWithEnrichment` if snapshot exists

### Read-Time Recomputation
Qualification is **never persisted to the database**. It is recomputed on every read:
- `GET /search/executions/:id` — execution summary
- `GET /search/executions/:id/results` — result detail
- `GET /leads` — lead list

This means qualification logic can be updated without data migration, but it's O(n) on every read.

### Strengths
- Pure domain logic — easy to test, no infrastructure coupling
- Read-time recomputation — logic updates take effect immediately
- Clear signal model (requested → observed → source → status)

### Weaknesses
- **No AI-driven qualification** — purely rule-based
- **No scoring/ranking** — leads have no priority score
- **No lead-to-lead comparison** — no "which lead is better" logic
- **Website presence is binary** — no quality assessment (broken site vs. rich site)
- **Social verification is HTTP-level only** — doesn't check content/activity
- **No configurable qualification rules** — hardcoded in domain logic

---

## 12. Scoring System

### Current State: **NOT IMPLEMENTED**

- `Lead.score` column does not exist in schema
- `Lead.priority` column does not exist in schema
- No lead ranking or sorting by quality
- No weighted scoring model
- `LeadCard` sorts by `createdAt DESC` (insertion order only)

### What's Needed
- Composite score: website quality + social presence + rating + verification + business type
- Configurable weights per user/organization
- Auto-recommendation of top leads
- Score-based pipeline prioritization

---

## 13. Leads Lifecycle

### Status Flow
```
NEW → REVIEWED → CONTACTED → QUALIFIED → DISQUALIFIED
  ↑                              ↓
  └──────── (reopen) ────────────┘
```

### Fields
- `id`, `query`, `companyName`, `formattedAddress`, `nationalPhoneNumber`, `websiteUri`
- `providerRecordId` (Google Places ID), `providerData` (JSONB — full Places response)
- `status` (enum: NEW/REVIEWED/CONTACTED/QUALIFIED/DISQUALIFIED)
- `notes` (user-provided text), `userId` (FK → users)
- `enrichmentStatus` (enum: EnrichmentStatus — NOT_STARTED/PENDING/IN_PROGRESS/ENRICHED/PARTIALLY_ENRICHED/FAILED/SKIPPED)
- `enrichmentSnapshot` (JSONB — website + social data)
- `enrichedAt` (TIMESTAMPTZ)
- `createdAt`, `updatedAt`, `deletedAt`

### CRUD Operations
| Endpoint | Method | Description |
|---|---|---|
| `POST /leads` | Save | Idempotent per user + providerRecordId |
| `GET /leads` | List | Filter by status, sorted by createdAt DESC |
| `GET /leads/:id` | Detail | Single lead with enrichment |
| `PATCH /leads/:id` | Update | Status and/or notes |
| `DELETE /leads/:id` | Soft-delete | Sets deletedAt |
| `POST /leads/:id/enrich` | Re-enrich | Atomic claim → HTTP enrichment → persist |

### Concurrency
- **Save:** Idempotent check prevents duplicate saves
- **Enrich:** Atomic conditional claim: `UPDATE ... WHERE status != 'IN_PROGRESS' OR (status = 'IN_PROGRESS' AND updatedAt < now() - 10min)`
- **Update:** No optimistic locking — last-write-wins

### Deduplication
- Per-user: same `providerRecordId` → returns existing lead (not duplicate)
- Cross-user: no deduplication
- Cross-search: no deduplication

---

## 14. Frontend Audit

### Component Architecture
```
App.tsx
  └── AuthenticatedApp.tsx
        └── Workspace.tsx
              ├── Sidebar.tsx
              ├── SearchView.tsx
              ├── RecentSearchesView.tsx
              ├── SavedLeadsView.tsx
              ├── LeadsPipelineView.tsx
              └── ResultDrawer.tsx (slide-in panel)
```

### Component Details

| Component | Lines | Purpose |
|---|---|---|
| `Workspace.tsx` | 237 | Root layout, sidebar nav, global state (`savedLeads`, `drawerResult`, `rerun`) |
| `SearchView.tsx` | 252 | Search form + result grid + enrich action |
| `ResultDrawer.tsx` | 352 | Slide-in detail panel (business info, enrichment, lead management) |
| `LeadCard.tsx` | 210 | Reusable card component (used in 3 views) |
| `SavedLeadsView.tsx` | 147 | Saved leads list with filter chips + enrich buttons |
| `LeadsPipelineView.tsx` | 114 | Kanban board with status columns |
| `RecentSearchesView.tsx` | 226 | Search history with execution details + enrich action |
| `Sidebar.tsx` | ~80 | Navigation sidebar with 5 items |
| `AuthenticatedApp.tsx` | ~120 | Auth wrapper, session management |
| `App.tsx` | ~60 | Root component, route detection |
| `types.ts` | ~100 | Shared TypeScript interfaces |

### State Management
- **No Redux, no Zustand, no Context** — pure `useState` + prop drilling
- `Workspace` holds: `savedLeads[]`, `drawerResult`, `rerun` state
- Callbacks passed down: `onSaveLead`, `onUpdateLead`, `onRemoveLead`, `onEnrichLead`, `onRerunSearch`
- **No shared query cache** — each view fetches independently
- **No optimistic updates** — all mutations re-fetch after completion

### API Layer
| Module | Endpoints | Purpose |
|---|---|---|
| `request.ts` | Core | `requestJson()` with auth refresh |
| `search.ts` | `POST /search`, `POST /search/runs` | Search execution |
| `search-history.ts` | `GET /search/history` | Recent searches |
| `executions.ts` | `GET /executions/:id`, `GET /executions/:id/results`, `POST /executions/:id/enrich` | Execution detail |
| `enrichment.ts` | `POST /leads/:id/enrich` | Lead re-enrichment |
| `leads.ts` | `POST /leads`, `GET /leads`, `PATCH /leads/:id`, `DELETE /leads/:id` | Lead CRUD |
| `auth.ts` | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Authentication |
| `user.ts` | `POST /auth/change-password` | Password management |

### Auth Flow
1. Login → `{ accessToken, refreshToken, user }` stored in `localStorage`
2. All requests include `Authorization: Bearer <accessToken>`
3. On 401: deduplicated `POST /auth/refresh` with refresh token
4. On refresh success: retry original request
5. On refresh failure: `clearSession()` → redirect to login
6. Concurrent 401s share a single refresh attempt (`refreshInFlight` promise)

### Strengths
- Clean Arabic UI throughout
- Functioning auth with refresh rotation
- Enrichment integrated into search, leads, and history views
- Real-time enrichment status updates
- No external UI library dependencies — full control

### Weaknesses
- **No router** — `window.history.pushState` + hash-based navigation is fragile
- **No state management library** — prop drilling becomes complex
- **No error boundaries** — unhandled errors crash the whole app
- **No loading skeletons** — only spinners
- **No virtual scrolling** — large result lists may be slow
- **No keyboard navigation** — mouse-only interaction
- **No accessibility (a11y)** — no ARIA labels, no focus management
- **No mobile responsiveness** — desktop-only layout
- **No offline support** — no service worker
- **No analytics** — no user behavior tracking
- **No i18n framework** — Arabic hardcoded in components

---

## 15. API Contracts

### Complete Endpoint Map (16 endpoints)

| # | Method | Path | Controller | Auth | Description |
|---|---|---|---|---|---|
| 1 | POST | `/auth/register` | AuthController | Public | Create account (GUEST role) |
| 2 | POST | `/auth/login` | AuthController | Public | Exchange credentials → tokens |
| 3 | POST | `/auth/refresh` | AuthController | Public | Rotate refresh token |
| 4 | POST | `/auth/logout` | AuthController | Bearer | Revoke session family |
| 5 | GET | `/auth/me` | AuthController | Bearer | Get user profile |
| 6 | POST | `/auth/change-password` | AuthController | Bearer | Change password |
| 7 | GET | `/health` | HealthController | Public | Liveness check |
| 8 | POST | `/search` | SearchController | Bearer | Execute business search |
| 9 | GET | `/search/history` | SearchController | Bearer | List recent searches |
| 10 | POST | `/search/runs` | RunController | Bearer | One-click lead discovery |
| 11 | POST | `/search/executions/:id/enrich` | EnrichController | Bearer | Enrich execution results |
| 12 | GET | `/search/executions/:id` | ExecutionResultsController | Bearer | Execution detail + summary |
| 13 | GET | `/search/executions/:id/results` | ExecutionResultsController | Bearer | Execution results with enrichment |
| 14 | POST | `/leads` | LeadsController | Bearer | Save a lead |
| 15 | GET | `/leads` | LeadsController | Bearer | List saved leads |
| 16 | GET | `/leads/:id` | LeadsController | Bearer | Get single lead |
| 17 | PATCH | `/leads/:id` | LeadsController | Bearer | Update status/notes |
| 18 | DELETE | `/leads/:id` | LeadsController | Bearer | Soft-delete lead |
| 19 | POST | `/leads/:id/enrich` | LeadsController | Bearer | Re-enrich a lead |

**Total: 19 endpoints** (corrected from initial estimate of 16)

### Global Configuration
- **Prefix:** `api/v1` (set in `app.bootstrap.ts`)
- **Validation:** Global `ValidationPipe` with whitelist + forbidNonWhitelisted
- **Guards:** ThrottlerGuard (rate limiting), AuthGuard (all routes), RolesGuard
- **Filters:** AllExceptionsFilter (global error handling)
- **Interceptors:** TransformInterceptor (response envelope `{ data: ... }`)

### Error Response Format
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Lead not found",
    "details": {}
  }
}
```

### Success Response Format
```json
{
  "data": { ... }
}
```
or
```json
{
  "data": [...],
  "meta": { "total": 10, "page": 1, "limit": 20 }
}
```

---

## 16. Database

### Active Models (11)
| Model | Table | Purpose | Row Estimate |
|---|---|---|---|
| `User` | `users` | Authentication + RBAC | Low |
| `Session` | `sessions` | Refresh token rotation | Low |
| `SearchJob` | `search_jobs` | Search request metadata | Growing |
| `SearchExecution` | `search_executions` | Search run instances | Growing |
| `SearchResult` | `search_results` | Individual search results | High (10-60 per execution) |
| `RawImport` | `raw_imports` | API response audit trail | High (1 per execution) |
| `RawImportRecord` | `raw_import_records` | Individual records per import | Unused (0 rows) |
| `Lead` | `leads` | Saved leads with enrichment | Growing |
| `Company` | `companies` | **UNUSED** — zero queries in code | 0 |
| `SocialProfile` | `social_profiles` | **UNUSED** — zero queries in code | 0 |
| `LeadActivity` | `lead_activities` | **UNUSED** — zero queries in code | 0 |

### Orphaned Models (29)
The following models exist in `prisma/schema.prisma` but are **never imported or queried** anywhere in the codebase:
- `Branch`, `Contact`, `Company` (company management)
- `SocialProfile`, `SocialMediaAnalysis`, `SocialMention`, `SocialTrend` (social intelligence)
- `DataEnrichment` (enrichment tracking)
- `Activity`, `LeadActivity` (activity logging)
- `Automation`, `AutomationLog`, `AutomationTemplate`, `AutomationTrigger` (automation)
- `AiInsight`, `AiModel`, `AiUsage` (AI usage tracking)
- `Tag`, `Category`, `Industry`, `Region` (categorization)
- `Task`, `TaskTemplate` (task management)
- `CompanyClaim`, `Evidence`, `Claim` (evidence/claim system)
- `SearchIntent`, `SearchProvider` (search configuration)

### Migration History
1. `20260701120000_init` — Initial schema (all tables)
2. `20260814171200_add_search_ownership` — Search user ownership
3. `20260817190300_add_enrichment_to_search_executions` — Enrichment status on executions
4. `20260818000000_add_lead_enrichment` — Lead enrichment fields (NOT applied to production)

### Database Conventions
- UUID primary keys on all tables
- `createdAt` / `updatedAt` / `deletedAt` (soft delete) on all user-facing tables
- `@@map("snake_case_table")` for table names
- `@map("snake_case")` for column names
- `@@index` with explicit map names
- `TIMESTAMPTZ` columns (Prisma 7 style — no `@default(now())` annotations needed)

### Unused Schema Bloat
**29 of 40 models are orphaned** — they exist in the schema, consume migration space, generate Prisma Client types, but have zero application code referencing them. This creates:
- Larger Prisma Client bundle
- Confusion about what's actually used
- Migration risk (changes to unused models can break builds)
- Schema documentation drift

---

## 17. Tests

### Backend Tests
- **Total:** 476 tests across 28 spec files
- **Framework:** Node.js built-in test runner via `tsx --test`
- **Execution:** `npm test` → `tsx --test "backend/src/**/*.spec.ts"`
- **Status:** 476/476 passing ✅
- **All mocked:** Zero database calls, zero HTTP calls, zero external dependencies

### Test Distribution
| Module | Spec Files | Test Count | Coverage |
|---|---|---|---|
| Search (Google Places) | 1 | 12 | Provider logic |
| Search (Enrichment Engine) | 1 | 28 | Engine orchestration |
| Search (Social Discovery) | 1 | 32 | Link discovery + verification |
| Search (Website Enrichment) | 1 | 19 | HTTP scraping |
| Search (Qualification) | 2 | 30+ | Rule-based qualification |
| Search (Repository) | 1 | 20+ | Prisma search job repo |
| Leads | 3 | 50+ | CRUD + enrichment |
| Auth | 2 | 40+ | JWT + RBAC |
| Common/Exceptions | 1 | 15+ | Error handling |
| Config/Env | 1 | 20+ | Validation |
| Other modules | 12 | ~150 | Various |

### Test Gaps
- **Zero integration tests** — no HTTP request tests, no database tests
- **Zero E2E tests** — no end-to-end flow validation
- **Zero frontend tests** — no React component tests, no Cypress/Playwright
- **Zero load tests** — no performance validation
- **Zero security tests** — no penetration testing, no SSRF bypass attempts
- **All mocked** — 476 tests verify logic in isolation, not system behavior

### Documentation Contradiction
- `AGENTS.md` claims "65 tests" — **false** (476 actual)
- `PROJECT_HANDOFF.md` claims "184 backend tests" — **false** (476 actual)
- `IMPLEMENTATION_STATUS.md` claims "184 tests" — **false** (476 actual)

---

## 18. Environment

### Required Variables
| Variable | Purpose | Required | Default |
|---|---|---|---|
| `DATABASE_URL` | Prisma CLI/migrations (build-time) | Yes | — |
| `DIRECT_DATABASE_URL` | Runtime DB connection | Yes | — |
| `GOOGLE_PLACES_API_KEY` | Google Places API | Yes | — |
| `JWT_SECRET` | Access token signing (≥32 chars) | Yes | — |
| `JWT_REFRESH_SECRET` | Refresh token signing (≥32 chars) | Yes | — |
| `JWT_EXPIRATION` | Access token TTL | No | 900 (15 min) |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL | No | 2592000 (30 days) |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `CORS_ORIGINS` | Allowed origins | No | `http://localhost:5173,http://localhost:3000` |
| `GOOGLE_MAPS_API_KEY` | Google Maps (separate key) | No | — |

### Validation
`backend/src/config/env.validation.ts` validates all env vars on startup. App refuses to boot if required vars are missing or malformed.

### Production Deployment
- **Vercel** with `vercel.json` pointing to compiled `dist/backend/src/serverless.js`
- **Supabase** PostgreSQL 15.8 (host: `aws-1-eu-central-1.pooler.supabase.com`)
- **Project:** `digital-wave-sales-intelligence`, team `team_LITM67ynC1zEVEy6RBt09E02`
- **Latest deployment:** `dpl_HmChvVMYK3DxSHwC8UmzUgjg3V6W`

---

## 19. Documentation vs Reality

### Accurate Claims
| Source | Claim | Status |
|---|---|---|
| `ARCHITECTURE.md` | Port/Adapter pattern | ✅ Correct |
| `ARCHITECTURE.md` | `domain/` has no NestJS/Prisma imports | ✅ Correct |
| `ARCHITECTURE.md` | Controllers delegate to single use-case | ✅ Correct |
| `DATABASE_RULES.md` | UUID PKs + soft delete | ✅ Correct |
| `DATABASE_RULES.md` | Prisma schema-first | ✅ Correct |
| `API_GUIDELINES.md` | Global prefix `api/v1` | ✅ Correct |
| `API_GUIDELINES.md` | Error envelope `{ error: { code, message } }` | ✅ Correct |
| `CODING_STANDARDS.md` | kebab-case files with artifact suffix | ✅ Correct |
| `PHASE_E_LEAD_INTELLIGENCE_SPEC.md` | E1–E4 design | ✅ Implemented correctly |

### Stale/Inaccurate Claims
| Source | Claim | Reality |
|---|---|---|
| `AGENTS.md` | "65 tests" | **476 tests** |
| `PROJECT_HANDOFF.md` | "184 backend tests" | **476 tests** |
| `PROJECT_HANDOFF.md` | "Phase D: not implemented" | **Phase D fully implemented and deployed** |
| `PROJECT_HANDOFF.md` | "Phase E: not started" | **E1–E4 fully implemented** |
| `IMPLEMENTATION_STATUS.md` | "184 tests" | **476 tests** |
| `IMPLEMENTATION_STATUS.md` | "Phase D: Pending" | **Phase D complete + deployed** |
| `CURRENT_PHASE.md` | "Phase D in progress" | **Phase D complete** |
| `ROADMAP_CURRENT.md` | "Phase D: next step" | **Phase D complete** |
| `PROJECT_HANDOFF.md` | "Phase E is blocked on D" | **Phase E is implemented** |

### Missing Documentation
- No API reference documentation (OpenAPI/Swagger)
- No deployment guide (Vercel-specific setup)
- No environment variable reference with descriptions
- No architecture decision records (ADRs)
- No changelog
- No contribution guide

---

## 20. Pipeline Status Matrix

| Phase | Design | Implementation | Tests | Deployed | Production |
|---|---|---|---|---|---|
| **Phase 0: Architecture Cleanup** | ✅ | ✅ | ✅ 184 | ✅ | ✅ |
| **Phase 0.5: Safe Cleanup** | ✅ | ✅ | ✅ 184 | ✅ | ✅ |
| **Phase 1: Sales Blueprint** | ✅ | — | — | — | — |
| **Phase C0: Search Foundation** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase C1: Search Integration** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase C2: Evidence System** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase C3: Entity Resolution** | ✅ | ❌ | — | — | — |
| **Phase C4: Deduplication** | ✅ | ❌ | — | — | — |
| **Phase C5: Search Auth** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase C6: Frontend Auth** | ✅ | ✅ | — | ✅ | ✅ |
| **Phase C7: Production Deploy** | ✅ | ✅ | — | ✅ | ✅ |
| **Phase C8: QA Validation** | ✅ | ✅ | — | ✅ | ✅ |
| **Phase D1: Website Enrichment** | ✅ | ✅ | ✅ 38 | ✅ | ✅ |
| **Phase D2: Social Discovery** | ✅ | ✅ | ✅ 32 | ✅ | ✅ |
| **Phase D3: Social Verification** | ✅ | ✅ | ✅ 28 | ✅ | ✅ |
| **Phase D4: Enrichment Pipeline** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase D5: Enrichment Persistence** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Phase E1: Read Path** | ✅ | ✅ | ✅ | ⚠️ Uncommitted | ⚠️ Not deployed |
| **Phase E2: Lead Persistence** | ✅ | ✅ | ✅ 445 | ⚠️ Uncommitted | ⚠️ Migration pending |
| **Phase E3: Lead Re-enrichment** | ✅ | ✅ | ✅ 476 | ⚠️ Uncommitted | ⚠️ Not deployed |
| **Phase E4: Frontend Activation** | ✅ | ✅ | ✅ 476 | ⚠️ Uncommitted | ⚠️ Not deployed |
| **Phase E5: AI Business Understanding** | ✅ | ❌ | — | — | — |
| **Phase F: AI System** | ✅ | ❌ | — | — | — |

---

## 21. Critical Gaps

### Security (S)
| ID | Severity | Description | Location |
|---|---|---|---|
| S-1 | **CRITICAL** | E2 migration NOT applied to production — Lead table has no enrichment columns | `prisma/migrations/20260818000000_add_lead_enrichment/migration.sql` |
| S-2 | **HIGH** | No rate limiting on `/leads/:id/enrich` — could overwhelm target websites | `backend/src/modules/leads/presentation/controllers/leads.controller.ts` |
| S-3 | **MEDIUM** | No CORS testing evidence — production CORS_ORIGINS may be misconfigured | `vercel.json` + `.env` |
| S-4 | **LOW** | JWT secrets in env — no rotation mechanism | Auth module |

### Architecture (A)
| ID | Severity | Description | Location |
|---|---|---|---|
| A-1 | **HIGH** | 29 orphaned Prisma models — schema bloat, migration risk | `prisma/schema.prisma` |
| A-2 | **HIGH** | 12 empty scaffold modules — confusion, dead code | `backend/src/modules/` |
| A-3 | **MEDIUM** | `Company` model unused — entity resolution never implemented | `backend/src/modules/company/` |
| A-4 | **MEDIUM** | `RawImport` write-only — audit trail never queried | Evidence system |
| A-5 | **MEDIUM** | No caching layer — repeated identical requests hit live services | Global |
| A-6 | **LOW** | No event system — no webhooks, no pub/sub | Global |

### Quality (Q)
| ID | Severity | Description | Location |
|---|---|---|---|
| Q-1 | **HIGH** | Zero integration tests — mocked unit tests only | Test suite |
| Q-2 | **HIGH** | Zero frontend tests — no React component tests | Frontend |
| Q-3 | **HIGH** | Stale documentation — test counts, phase status all wrong | `AGENTS.md`, `docs/handoff/` |
| Q-4 | **MEDIUM** | No E2E tests — no Playwright/Cypress | Test suite |
| Q-5 | **MEDIUM** | No OpenAPI/Swagger — no API reference docs | Backend |
| Q-6 | **LOW** | No TypeScript strict mode in frontend | `frontend/tsconfig.json` |

### Feature (F)
| ID | Severity | Description | Location |
|---|---|---|---|
| F-1 | **CRITICAL** | AI system completely unbuilt — core differentiator missing | `backend/src/modules/ai/` |
| F-2 | **HIGH** | No lead scoring/ranking — no priority system | Lead model |
| F-3 | **HIGH** | No entity resolution — duplicates across searches/users | Search domain |
| F-4 | **MEDIUM** | No Arabic-specific social platforms (Anghami, Talabat, etc.) | `SocialDiscoveryProvider` |
| F-5 | **MEDIUM** | No structured data extraction (JSON-LD, microdata) | `WebsiteEnrichmentProvider` |
| F-6 | **MEDIUM** | No content analysis — only link discovery, no text understanding | Enrichment |
| F-7 | **LOW** | No offline support — no service worker | Frontend |
| F-8 | **LOW** | No analytics — no user behavior tracking | Global |

---

## 22. Current Journey — What's Next

### Immediate (deploy blockers)
1. **Apply E2 migration to production** — Lead table enrichment columns missing
2. **Deploy E1–E4 to production** — 4 commits of uncommitted changes
3. **Update documentation** — Fix stale test counts and phase statuses in `AGENTS.md`, `PROJECT_HANDOFF.md`, `IMPLEMENTATION_STATUS.md`

### Short-term (next engineering phases)
1. **Phase F: AI System** — The product's core differentiator
   - `AiProviderPort` → `GeminiAiAdapter` (abstracted, swappable)
   - Use cases: intent parsing (replace `translateArabicIntent()`), lead scoring, activity analysis
   - Prompt templates for Arabic business analysis
   - Token tracking and cost management
   - Graceful degradation (rule-based fallback when AI unavailable)

2. **Entity Resolution** — Deduplicate across searches/users
   - Fuzzy matching on `companyName` + `formattedAddress`
   - Canonical company records
   - Cross-user lead intelligence

3. **Integration Tests** — Validate the full request flow
   - HTTP request tests (NestJS `TestingModule`)
   - Database integration tests (testcontainers or Supabase test DB)
   - Google Places API integration tests (recorded responses)

### Medium-term
1. **Lead Scoring** — Composite quality score with configurable weights
2. **Social Content Analysis** — Scrape and analyze social media content (not just links)
3. **Caching Layer** — Redis or in-memory cache for repeated queries
4. **Rate Limiting** — Per-user, per-endpoint rate limits
5. **Frontend Tests** — React component tests, E2E tests
6. **OpenAPI Documentation** — Auto-generated API reference

### Long-term
1. **Real-time Updates** — WebSocket for enrichment progress
2. **Batch Operations** — Bulk lead management
3. **Export/Import** — CSV/Excel integration
4. **Team Features** — Multi-user collaboration
5. **Analytics Dashboard** — Pipeline metrics, conversion tracking

---

## Appendix: Complete File Map

### Backend Source Files (109 hand-written)
```
backend/src/
├── app.bootstrap.ts              # NestJS app factory + global setup
├── main.ts                       # Server entry (listen)
├── serverless.ts                 # Vercel entry (no listen)
├── config/
│   ├── app.config.ts             # ConfigModule setup
│   ├── database.config.ts        # PrismaModule setup
│   ├── env.validation.ts         # Joi env schema + ConfigService validation
│   └── logger.config.ts          # LoggerModule setup
├── common/
│   ├── decorators/current-user.decorator.ts
│   ├── decorators/public.decorator.ts
│   ├── enums/role.enum.ts
│   ├── exceptions/
│   │   ├── all-exceptions.filter.ts
│   │   ├── business-rule.exception.ts
│   │   ├── conflict.exception.ts
│   │   ├── error-codes.ts
│   │   └── not-found.exception.ts
│   ├── filters/http-exception.filter.ts
│   ├── guards/roles.guard.ts
│   ├── interceptors/transform.interceptor.ts
│   ├── interfaces/
│   │   ├── enriched-result.interface.ts
│   │   ├── search-port.error.ts
│   │   └── search-result.interface.ts
│   ├── ports/
│   │   ├── enrichment/
│   │   │   ├── social-discovery.port.ts
│   │   │   ├── social-verification.port.ts
│   │   │   └── website-enrichment.port.ts
│   │   └── search/
│   │       ├── search-job.repository.ts
│   │       ├── search.provider.ts
│   │       └── search.repository.ts
│   └── utils/
│       ├── domain-extraction.util.ts
│       ├── enrichment-projection.util.ts
│       └── id-generation.util.ts
├── database/
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
├── modules/
│   ├── activity/                 # Empty scaffold (0 bytes)
│   ├── ai/                       # Empty scaffold (0 bytes)
│   ├── automation/               # Empty scaffold (0 bytes)
│   ├── auth/
│   │   ├── application/use-cases/
│   │   │   ├── change-password.usecase.ts
│   │   │   ├── login.usecase.ts
│   │   │   ├── logout.usecase.ts
│   │   │   ├── refresh-token.usecase.ts
│   │   │   └── register.usecase.ts
│   │   ├── auth.module.ts
│   │   ├── domain/
│   │   │   ├── entities/user.entity.ts
│   │   │   └── ports/
│   │   │       ├── session.repository.ts
│   │   │       └── user.repository.ts
│   │   ├── infrastructure/
│   │   │   ├── persistence/
│   │   │   │   ├── prisma-session.repository.ts
│   │   │   │   └── prisma-user.repository.ts
│   │   │   └── providers/jwt.provider.ts
│   │   └── presentation/
│   │       ├── controllers/auth.controller.ts
│   │       ├── dto/
│   │       │   ├── change-password.dto.ts
│   │       │   ├── login.dto.ts
│   │       │   └── register.dto.ts
│   │       └── guards/
│   │           └── jwt-auth.guard.ts
│   ├── branch/                   # Empty scaffold
│   ├── category/                 # Empty scaffold
│   ├── company/                  # Empty scaffold (model exists but unused)
│   ├── contact/                  # Empty scaffold
│   ├── health/
│   │   ├── health.module.ts
│   │   └── presentation/health.controller.ts
│   ├── leads/
│   │   ├── application/use-cases/
│   │   │   ├── enrich-lead.usecase.ts
│   │   │   ├── get-lead.usecase.ts
│   │   │   ├── list-leads.usecase.ts
│   │   │   ├── remove-lead.usecase.ts
│   │   │   ├── save-lead.usecase.ts
│   │   │   └── update-lead-status.usecase.ts
│   │   ├── domain/
│   │   │   ├── entities/lead.entity.ts
│   │   │   └── ports/lead.repository.ts
│   │   ├── infrastructure/persistence/prisma-lead.repository.ts
│   │   ├── leads.module.ts
│   │   └── presentation/
│   │       ├── controllers/leads.controller.ts
│   │       └── dto/
│   │           ├── create-lead.dto.ts
│   │           ├── enrich-lead.dto.ts
│   │           └── update-lead.dto.ts
│   ├── search/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   ├── search.module.ts
│   │   └── presentation/
│   └── social-profile/           # Empty scaffold
├── tags/                         # Empty scaffold
├── task/                         # Empty scaffold
├── user/                         # Empty scaffold
└── website/                      # Empty scaffold
```

### Frontend Source Files (21 hand-written)
```
frontend/src/
├── api/
│   ├── auth.ts
│   ├── enrichment.ts
│   ├── executions.ts
│   ├── leads.ts
│   ├── request.ts
│   ├── search-history.ts
│   ├── search-options.ts
│   ├── search.ts
│   └── user.ts
├── components/
│   ├── AuthenticatedApp.tsx
│   ├── LeadCard.tsx
│   ├── LeadsPipelineView.tsx
│   ├── RecentSearchesView.tsx
│   ├── ResultDrawer.tsx
│   ├── SavedLeadsView.tsx
│   ├── SearchView.tsx
│   ├── SettingsView.tsx
│   ├── Sidebar.tsx
│   └── Workspace.tsx
├── App.tsx
├── index.css
├── main.tsx
└── types.ts
```

### Configuration Files
```
/
├── AGENTS.md                     # Agent conventions (STALE)
├── package.json                  # Root package
├── tsconfig.json                 # Root TS config
├── tsconfig.build.json           # Build TS config
├── vercel.json                   # Vercel deployment
├── .env.example                  # Environment template
├── prisma/
│   ├── schema.prisma             # Database schema (40 models)
│   ├── prisma.config.ts          # Prisma config
│   └── migrations/               # 4 migrations
├── backend/
│   ├── package.json              # Backend dependencies
│   ├── tsconfig.json             # Backend TS config
│   └── src/                      # Backend source
├── frontend/
│   ├── package.json              # Frontend dependencies
│   ├── tsconfig.json             # Frontend TS config
│   ├── vite.config.ts            # Vite config
│   ├── index.html                # Entry HTML
│   └── src/                      # Frontend source
└── docs/                         # Documentation
    ├── ARCHITECTURE.md
    ├── API_GUIDELINES.md
    ├── CODING_STANDARDS.md
    ├── DATABASE_RULES.md
    ├── ERROR_HANDLING.md
    ├── NAMING_CONVENTIONS.md
    ├── SECURITY.md
    ├── PHASE_E_LEAD_INTELLIGENCE_SPEC.md
    ├── SYSTEM_AUDIT_REPORT.md    # This report
    └── handoff/
        ├── AI_PRODUCT_SPEC.md
        ├── CURRENT_PHASE.md
        ├── IMPLEMENTATION_STATUS.md
        ├── PROJECT_HANDOFF.md
        └── ROADMAP_CURRENT.md
```

---

*End of System Audit Report*
