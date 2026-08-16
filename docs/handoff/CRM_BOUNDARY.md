# CRM_BOUNDARY.md — CRM integration boundary

**Status: design reference. NOT implemented.** The user's rule: connect to the Digital Wave CRM **only after** the standalone Search Intelligence → AI → opportunity → lead-qualification → real-lead-test flow works (Phase H). Do NOT build CRM functionality now.

## In scope NOW (never touch CRM)

- Standalone search + lead discovery (Phase C).
- Enrichment (D), AI understanding (E), opportunity/scoring (F), real-lead validation (G).
- Leads live **in this project's DB** (`Lead` table) until Phase H.

## Explicitly OUT of scope (until Phase H)

- **No CRM sync** — no outbound pushes of leads to a CRM.
- **No CRM API calls / SDKs** — no CRM client, webhooks, or pipelines.
- **No CRM UI** — this project never renders the CRM's pipeline/contacts/deals; its own kanban (`LeadsPipelineView`) is a local view of `Lead` rows only.
- **No CRM-automation triggers** — nothing fires CRM workflows on lead creation.

## Why this boundary exists

The user is testing the **search/lead product** independently. CRM connection introduces coupling, credentials, external-state assumptions, and would blur the product's failure/success surface. Keep the product self-contained until the standalone value is proven.

## Phase H plan (design intent, not code)

1. A `CrmSyncPort` in `application`/`domain` (like `SearchProviderPort`), adapter in `infrastructure` — abstract so the CRM could be Digital Wave CRM or later others.
2. Only **qualified** leads (status QUALIFIED, Phase G-validated) are candidates to sync.
3. Sync is explicit and traceable: `Lead` gains sync state (e.g., `crmStatus`, `crmExternalId`, `lastSyncedAt`) — requires a written schema proposal + migration (Freeze Rule 1).
4. Read `Lead` snapshots from this DB; never store CRM secrets in the repo (env only, ≥32 chars where relevant).
5. No two-way CRUD replication: this product publishes qualified leads; CRM owns pipeline stage changes.

## Contradictions to avoid

- Old docs that describe `Company`/`Branch`/etc. tables as the CRM integration path are **design references**, not an instruction to wire them now. Those tables stay frozen/unused until Phase H.
- Do NOT create `crm_*` tables, sync jobs, or webhooks during Phases C–G.
