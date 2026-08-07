# 03 — Search Builder

Status: Draft v1.0 (Phase 5.2)
Cross-referenced by: MASTER_ARCHITECTURE.md §3, 01-provider-architecture.md, 02-search-pipeline.md, 04-unified-search-model.md, 03-import-source.md, 04-search-job.md, 06-search-execution.md, 08-verification-record.md, ADR-010

## 1. Purpose

The Search Builder is the human-facing surface of the search pipeline. It turns a
user's intent into a **validated, deterministic Search Plan** that becomes a Search Job
definition (04-search-job.md) executed by Search Executions (06-search-execution.md). It
is a **compiler, not an interpreter**: it assembles structured filters into a plan and
never guesses at meaning.

```
user intent → Search Builder → validated Search Plan → Search Job definition → executions
```

## 2. Basic Search

Basic Search is the default surface: a small, curated set of filters that a user must
reason about. Filters are **structured selections** (country/state/city lists, industry
taxonomy) — never free-text that the system must interpret.

| Filter | Applies to | Why it is required here | Notes |
|---|---|---|---|
| Country | Canonical Address (`countryCode`) | Geographic scope is the strongest disambiguator and a hard legal/territorial boundary. | Always required in Basic Search; ISO 3166-1 alpha-2 (ADR-008 alignment). |
| State / Province | Canonical Address (`region`) | Narrows territory within a country; most industries are state-regulated. | Dependent on Country (Section 4). |
| City | Canonical Address (`city`) | Typical sales territory unit; the finest usable granularity before Area. | Dependent on Country. |
| Area | Canonical Address (street/neighborhood context via `formatted`, radius via lat/lng) | Local businesses live in neighborhoods; enables radius search around a point. | Dependent on Country; optional in Basic. |
| Industry | Canonical Category tree (Category `code`) | Drives relevance; most Sales Profiles (Section 6) are industry-shaped. | Structured taxonomy selection, not free text. |

Rules:

- Country is always required. Industry is required unless a Search Profile (Section 6)
  already supplies it.
- State/City/Area are optional but validated against their parent (a city must belong to
  the selected country).
- Basic Search never accepts free-text keywords; that belongs to Advanced Search only
  where it is allowed.

## 3. Advanced Search

Advanced Search exposes the full optional filter set. Every filter must have a reason:
it either **narrows to a decision-relevant signal** or **excludes noise**. Filters here
operate on the Canonical Model (04-unified-search-model.md), never on provider-specific
fields.

| Filter | Applies to | Why it exists | Source of truth |
|---|---|---|---|
| Website | Canonical Website (`domain`) | Website is a durable identity anchor and the best provider cross-reference; domain presence implies a business is findable. | Canonical Website. |
| CRM | Company attribute (software usage) | High-value prospect signal: a business already paying for CRM is in sales motion. | Enrichment attribute (02 §2.6), evidence from technology hints. |
| Automation | Company attribute (software usage) | Marketing/sales automation indicates an active, receptive org. | Enrichment attribute. |
| Booking | Company attribute (booking/scheduling software) | Bookable businesses (clinics, restaurants) convert through appointment funnels. | Enrichment attribute. |
| Employees | Company size band | Size filters capacity, budget, and decision-maker availability. | Enrichment/verification attribute; size band from collected evidence. |
| Revenue | Company revenue band | Filters affordability and tier-fit for the offer. | Enrichment attribute (estimate, never fabricated). |
| Branches | Branch count | Multi-branch orgs are larger accounts; branch count reflects scale. | Derived from Branch records. |
| Google Rating | Rating snapshot | Public trust signal; rating thresholds select quality-fit accounts. | Verification Record / rating evidence (08). |
| Review Count | Review snapshot | Volume of reviews signals activity and social proof. | Verification Record / rating evidence. |
| Technologies | Canonical Website `techHints` / technology evidence | Technology fingerprint filters for tech-fit (e.g., a needed integration already installed). | Canonical Website technology evidence (ADR-009-adjacent enrichment). |
| Facebook / Instagram / LinkedIn | Canonical Social Profile presence per platform | Social presence indicates digital maturity and provides a contact/engagement channel. | Canonical Social Profile (`platform` per SocialPlatform). |
| Email | Canonical Contact Method (type email) | Direct outreach capability; "has verifiable email" is a hard sales requirement. | Canonical Contact Method + Verification Record. |
| Phone | Canonical Contact Method (type phone) | Direct outreach capability; phone reachability. | Canonical Contact Method + Verification Record. |
| Last Review | Most recent rating evidence date | Recency of social proof; stale activity devalues an account. | Rating evidence timestamp. |
| Business Status | Company `status` (ACTIVE/…) | Excludes closed/suspended entities; a compliance-driven filter. | Canonical Company. |
| Verified Only | Verification Record `confirmed` status | Only accounts whose key attributes are verified (08); protects pipeline quality. | Verification Record (08) — a quality gate, not a provider filter. |

Two hard rules:

1. **Every Advanced filter maps to canonical evidence** — a filter with no backing
   canonical attribute is rejected by validation (Section 4). Filters never query
   providers directly.
2. **Filters filter, they never interpret** — "Email" means "has a confirmed/verifiable
   email contact method", never "the person likely responds to email". Interpretation
   belongs to later stages (02 §2.6–2.10).

## 4. Search Validation

### 4.1 Required fields

- Country (always).
- Industry (unless supplied by a Search Profile).
- At least one narrowing filter if the basic set alone would exceed the plan's result
  budget (Section 4.4).

### 4.2 Optional fields

- State/Province, City, Area, Website, CRM, Automation, Booking, Employees, Revenue,
  Branches, Google Rating, Review Count, Technologies, Facebook, Instagram, LinkedIn,
  Email, Phone, Last Review, Business Status, Verified Only.
- Optional filters default to "unconstrained" — absence means the plan does not filter
  on that dimension.

### 4.3 Dependencies between filters

- State/Province, City, Area: each requires the selected Country; City requires the
  selected State when the taxonomy links them; Area requires City or a center point.
- Industry hierarchy: selecting a child Category is valid only when consistent with its
  ancestors in the Category tree.
- Employees/Revenue bands and Branches count are additive size signals; combining them
  is allowed but must be **intersection-consistent** (e.g., small-company band with a
  branch count > 20 is contradictory).
- Verified Only combines with every filter (it is an orthogonal quality gate).
- Google Rating / Review Count / Last Review: all consume rating evidence; if the plan
  requires them, the plan must route to providers whose capabilities supply rating
  evidence (01 §4.2 capability-based discovery) — otherwise the plan is invalid.

### 4.4 Invalid combinations

Rejected at plan-build time with a precise reason (never silently corrected):

| Invalid combination | Why |
|---|---|
| City not in selected Country/State | Contradictory geography. |
| Employee band + Branch count contradiction | Impossible size signal. |
| Rating/Review filter with no provider capability | Plan cannot be satisfied (01 §3.3). |
| Free-text keyword in Basic Search | Basic Search is structured-only. |
| Duplicate contradictory filters (e.g., two revenue bands) | Ambiguous intent. |
| More than one primary location scope (Country + Country) | Ambiguous territory. |

### 4.5 Validation strategy

- **Client-side**: structure (list membership, taxonomy paths) validated against the
  canonical taxonomies as the user builds.
- **Server-side (the plan boundary)**: the complete plan is validated atomically before
  a Search Job is created. A plan is either fully valid or rejected; partial plans
  never execute.
- **Deterministic**: identical filter inputs always produce the identical plan
  (Section 7). Validation output is a stable plan fingerprint, enabling reproducible
  reruns and shared plans.
- **Human-readable**: every rejection message names the failing filter pair and the
  dependency rule, so users fix intent rather than guess.

## 5. Saved Searches

Saved Searches make validated plans reusable. Each saved search is a **named, immutable
plan snapshot** (filters + validation result), not a live form.

| Kind | Semantics | Mapping |
|---|---|---|
| Templates | Canonical, reusable plan skeletons (usually one per Search Profile, Section 6) with slots a user must fill (e.g., Country, City). | Feed Search Job definitions (04). |
| Favorites | A user's personal, parameterized plans saved for one-click reuse. | Owned per user; workspace-scoped. |
| Recent Searches | Read-only history of plans actually executed (plan fingerprint + result counts), for quick re-runs. | Sourced from Search Execution history (06). |
| Shared Searches | A saved plan shared within a workspace (team-visible, owner-editable). | Workspace-scoped per ADR-010. |
| Scheduled Searches | A saved plan bound to a schedule; produces recurring Search Jobs/Executions. | Search Job `schedule` trigger (04/06 §4). |

Rules:

- Reusing a saved search always re-validates the plan against current taxonomies;
  a saved plan is never executed with stale data.
- Sharing never copies credentials or provider scoping — the plan is data, not access.
- A Scheduled Search is an automation, subject to workflow policy (10-workflow.md,
  11-automation-job.md); AI can propose a schedule but never create one unilaterally
  (06 §12).

## 6. Search Profiles

A Search Profile is a **pre-validated Basic+Advanced template** opinionated for a
vertical. Profiles exist because each vertical has stable, high-signal filter shapes;
they constrain the builder to what is decision-relevant and reject what is not.
Profiles are architecture, not code: they are data (plan templates + filter allowlists).

| Profile | Core filters | Why these | Rejected (with reason) |
|---|---|---|---|
| Find Clinics | Country, City, Area, Industry=Healthcare, Booking, Verified Only, Google Rating | Clinics convert through appointments; rating + verified = quality-led demand. | Employees (irrelevant to clinic fit); Website (not decision-relevant). |
| Find Restaurants | Country, City, Area, Booking, Google Rating, Review Count, Last Review | Local footfall + social proof dominate; activity recency matters. | Employees/Revenue (noisy, unreliable for restaurants). |
| Find Manufacturing | Country, State, Industry=Manufacturing, Employees, Revenue, Technologies, Verified Only | B2B manufacturing is scale- and capability-led. | Google Rating/Review Count (low signal for manufacturing). |
| Find Real Estate | Country, City, Area, Branches, Website, LinkedIn | Agencies are multi-branch, digitally indexed firms. | Booking (rarely relevant). |
| Find SaaS | Country, Industry=Software, Technologies, CRM, Automation, Employees, Revenue, LinkedIn | Tech-fit and tooling signals predict adoption; decision-makers are on LinkedIn. | Google Rating/Review Count (weak signal for SaaS). |

Design rules for profiles:

- A profile is an **allowlist + defaults**; users may add non-allowlisted Advanced
  filters but the profile then loses its "profile" badge (it becomes a custom plan).
- Profiles must be authored against current taxonomies and re-validated on taxonomy
  change.
- New profiles are additive; adding one never alters existing plans.

## 7. Search Builder Principles

1. **Structured search over free-text** — every filter is a typed selection backed by a
   canonical taxonomy (country, state, city, category, contact type, platform, status).
   The builder never parses free text; there is nothing to misread.
2. **Deterministic behavior** — identical filter inputs produce the identical plan and
   the identical plan fingerprint. Two users building the same search in two workspaces
   get the same plan, so results, reruns, and audits are comparable.
3. **No AI interpretation** — the builder does not infer intent, expand keywords,
   correct spelling, or guess filters. AI may *propose* a plan (06 §12), but the
   proposed plan passes the same structured validation and is executed only when a
   human or authorized workflow confirms it.
4. **Predictable search plans** — a plan is a finite, explicit list of filters, their
   targets in the Canonical Model (04), and the provider capabilities required
   (01 §3.3). Plan cost and provider routing are derivable from the plan before any
   execution begins — there are no hidden or implicit filters.

## Related Review Decisions

- Aligns with ADR-010: Search Jobs/Executions are workspace-scoped; saved/shared
  searches respect that boundary.
- Feeds 02-search-pipeline.md stage 1 (Search): the Search Plan is the job definition
  the pipeline executes.
- References 04-unified-search-model.md: every filter resolves to a canonical entity or
  canonical attribute; filters never touch provider-specific fields.
- Consistent with 08-verification-record.md: "Verified Only" and rating filters are
  evidence-gated (confirmed records), not provider-output filters.
