# CURRENT_PHASE.md — Where the project stands and what happens next

**Snapshot: 2026-08-16.** Phases per `ROADMAP_CURRENT.md`.

## Status summary

| Phase | Title | Status |
|---|---|---|
| A | Search foundation | ✅ DONE |
| B | Lead management | ✅ DONE |
| **C** | **Real provider / real lead discovery** | **NEXT (not started)** |
| D | Digital presence enrichment | not started |
| E | AI business understanding (Gemini) | not started |
| F | Opportunity scoring + recommended service | not started |
| G | Real lead validation | not started |
| H | CRM integration | not started (user-gated) |
| I | Automation / workflows | not started |
| J | Advanced autonomous | not started |

## What "DONE" means (verified)

- Search API works end-to-end with the **mock** provider (Arabic-aware, honest empty state); full persistence trail (ImportSource/SearchJob/SearchExecution/RawImport/SearchResult) written atomically.
- Google Places provider adapter implemented + unit-tested but **not active in the deployed environment** (no `GOOGLE_MAPS_API_KEY` there; deployed searches return `providerId: "mock"`).
- Leads: save (idempotent) / list / get / update (status, notes) / soft delete; Saved Leads + kanban + settings UI; `/dashboard` routing; refresh-safe SPA.
- Auth: full JWT with refresh rotation + reuse detection + RBAC; `GET /api/v1/health` reports DB up.
- Backend: **184 tests pass**; lint + format clean; build clean. Frontend: oxlint clean, builds; **no automated tests**.
- Deployed: latest preview `71v31rsi7` (dashboard + auth fix); production alias intentionally still the old `9d5fuo7j3`; Vercel SSO disabled.

## Immediate next steps (Phase C, awaiting user approval to implement)

1. **Commit the uncommitted work** (~100 files on `main`; requires user approval; block until then). Review the staged 0-byte scaffold `*.module.ts` files while at it.
2. **Decide real-provider configuration**: set `SEARCH_PROVIDER=google-places` + `GOOGLE_MAPS_API_KEY` in the preview/deployed env (needs the user's key value), or keep mock for more testing.
3. **Real lead test**: run a real search in the target domain, verify results/persistence/lead-save, and have the user validate that a discovered lead is correct.
4. Optionally: add first frontend automated tests and make Workspace nav URL-addressable (small UX debt).

## What NOT to do next

- No AI/Gemini (Phase E), no enrichment (D), no CRM (H), no automation (I), no n8n, no Clerk, no production deploy, no `db push`, no new migrations without a written schema proposal.

## Where to look for more

- `PROJECT_HANDOFF.md` — everything about the product (sections A–X).
- `IMPLEMENTATION_STATUS.md` — feature-by-feature status + evidence.
- `ROADMAP_CURRENT.md` — full phase specs.
- `AI_PRODUCT_SPEC.md`, `CRM_BOUNDARY.md` — boundary specs.
- `FILE_MANIFEST.md` — complete file inventory.
