# ROADMAP_CURRENT.md — Current roadmap (phases A–J)

Authoritative current direction, derived from the user's explicit ordering. **Overrides** older roadmap/plan docs where they conflict (`IMPLEMENTATION_RESTART_PLAN.md`, `MASTER_ARCHITECTURE.md`). Each phase must be **approved by the user before starting** — do not implement ahead of the current phase.

**User's flow:** SEARCH INTELLIGENCE FIRST → AI BUSINESS UNDERSTANDING → DIGITAL PRESENCE AUDIT → OPPORTUNITY DETECTION → LEAD QUALIFICATION → REAL LEAD TEST → ONLY THEN CRM INTEGRATION → ONLY THEN broader AI automation/workflows.

---

## Phase A — Search foundation ✅ DONE

- **Objective:** standalone business search that finds and reliably stores discovered businesses.
- **Delivered:** search module (provider port + factory), mock + Google Places provider adapters, normalization, persistence (ImportSource → SearchJob → SearchExecution → RawImport → SearchResult, atomic), search API + history, auth-gated. Frontend search + history UI. Deployed preview.
- **Status:** DONE (see `IMPLEMENTATION_STATUS.md`).

## Phase B — Lead management ✅ DONE

- **Objective:** save, organize, and manage discovered leads.
- **Delivered:** `Lead` model + module, idempotent save, status/notes update, soft delete, Saved Leads + kanban pipeline + settings UI, `/dashboard` routing.
- **Status:** DONE.

## Phase C — Real provider / real lead discovery (NEXT)

- **Objective:** run discovery on **real** data, not the mock.
- **Prereqs:** Phase B done; env decision (`SEARCH_PROVIDER=google-places` + `GOOGLE_MAPS_API_KEY`); commit uncommitted work.
- **Work items (when approved):**
  - Configure the Google Places key in the preview/deployed env; confirm provider factory selects `google-places`.
  - Real end-to-end discovery against a real DB; verify persistence + history + lead-save with real results.
  - Fix provider gaps surfaced by real data (normalization, field mapping, error paths).
  - First **REAL LEAD TEST** — user validates that a discovered lead is correct and complete.
  - Add frontend tests (first automated coverage) + make nav URL-addressable (small UX debt).
- **Acceptance:** user confirms real search results match reality for their target categories; a real lead is saved end-to-end.
- **Must NOT:** claim "real discovery complete" until this phase's acceptance passes; no AI yet.

## Phase D — Website + digital presence enrichment

- **Objective:** for each discovered business, gather its digital presence: website, social profiles, ratings, reviews, contact methods.
- **Design refs:** `docs/sales-intelligence/05-enrichment-engine.md`, frozen CRM tables (`Website`, `SocialProfile`, `ContactMethod`), `docs/database/{06-contact-method,07-website,08-social-profile}.md`.
- **Acceptance:** per-business enrichment data is collected, stored, and displayed with sources/evidence.

## Phase E — AI business understanding (Gemini)

- **Objective:** AI interprets search intent and explains WHY a business is a lead — grounded only in collected evidence.
- **Constraints:** Gemini preferred (owner has Gemini Pro); provider must stay abstract (port/interface); AI must never invent facts; advisory, human-approved outputs. See `AI_PRODUCT_SPEC.md`.
- **Design refs:** `docs/sales-intelligence/07-ai-insights.md`.
- **Acceptance:** AI analysis includes cited evidence for every claim.

## Phase F — Opportunity scoring + recommended service

- **Objective:** detect what each business is missing / its problems, and recommend what Digital Wave should sell; score/prioritize leads.
- **Design refs:** `docs/sales-intelligence/06-opportunity-engine.md`.
- **Acceptance:** a ranked lead list with evidence-backed recommendations.

## Phase G — Real lead validation

- **Objective:** validate leads against reality (the user's REAL LEAD TEST) before anything reaches a CRM.
- **Acceptance:** user confirms qualified leads are genuinely actionable.

## Phase H — CRM integration

- **Objective:** sync qualified leads to the Digital Wave CRM.
- **Constraint (user):** ONLY after G. See `CRM_BOUNDARY.md`.
- **Acceptance:** qualified leads flow to the CRM pipeline; no CRM UI built inside this project.

## Phase I — Automation / workflows

- **Objective:** broader AI automation / workflows (e.g., outreach) — only after CRM.
- **Constraint (user):** no n8n for now; in-house workflow/automation design exists (`docs/database/shared/{10-workflow,11-automation-job}.md`, `docs/sales-intelligence/09-module-boundaries.md`).

## Phase J — Advanced autonomous sales intelligence

- **Objective:** the long-arc vision (discover → dedupe → audit → social → AI → score → CRM → automate) running with minimal human input.

---

## Cross-cutting rules

- **Approval gate:** every phase needs explicit user approval. Never jump ahead.
- **Committing:** uncommitted work must be committed (with user approval) before starting C.
- **Never:** production deploys, `db push`, Clerk, `@@unique([.., deletedAt])`, non-abstract AI provider, n8n, CRM UI.
- **Schema changes:** any new tables require a written schema-design proposal first (Freeze Rule 1) and a migration (`prisma migrate dev`), never `db push`.
- **Evidence:** AI features must be grounded in persisted platform data.
