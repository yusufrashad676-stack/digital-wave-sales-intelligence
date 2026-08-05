# GLOSSARY.md

## Digital Wave Sales Intelligence Platform — Official Business Glossary

**Version:** 1.0
**Owner:** Product & Architecture
**Status:** Approved baseline for domain modeling and database design

---

## Purpose

This document is the authoritative business glossary for the Digital Wave
Sales Intelligence Platform. It defines every core business concept using
one unambiguous meaning, so that engineers, product managers, and analysts
speak the same language when designing schemas, writing use-cases, naming
fields, and reviewing code.

This is a **Sales Intelligence Platform**, not a traditional CRM. The platform
sources, enriches, qualifies, and continuously maintains external business
data (organizations, people, and their digital presence) and uses that data to
support outreach, automation, and analysis. It does not primarily manage an
internal sales pipeline owned by a single salesperson.

Every entity in this glossary has **one clear responsibility**. A term that
would need to mean two things at once is a design error — split it.

**Non-negotiable semantic rules** (must hold in every model, query, and UI):

- **Contact Method is NOT a person.** A person has contact methods; a contact
  method is never the subject of an activity or task.
- **A Person may own multiple Contact Methods** of the same or different types.
- **A Branch belongs to exactly one Organization.**
- **An Organization may have many Branches.**
- **A Website is independent from Social Profiles.** They are separate digital
  presence entities, not interchangeable, not parent/child.
- **AI never edits data directly.** AI reads and proposes; humans or audited
  jobs apply changes.
- **Verification is always auditable.** Every verification has a recorded
  actor, method, and timestamp.
- **Every entity has a single clear responsibility.**

---

## Core Entities

### Organization (Company)

The business entity that is the subject of research, enrichment, and outreach.

- **Definition:** A distinct business organization operating under a legal or
  commercial identity, uniquely identified by a platform-generated ID and, when
  available, a stable external identifier (e.g., registered company number,
  tax ID, or domain).
- **Purpose:** Serves as the primary research target and the root of the data
  hierarchy. Everything the platform sells is organized around Organizations.
- **Relationships:**
  - Owns one or more **Branches**.
  - May have an associated **Website** and **Social Profiles** (via the digital
    presence model, but these are independent entities — not children of the
    Organization row).
  - Employs **Persons**; Persons may be linked to one or more Organizations.
  - Is classified by **Categories** and **Tags**.
  - Is the unit on which **Activities**, **Leads**, **Verifications**, and
    **AI Insights** are scoped.
- **Notes:** Prefer the term **Organization** in code and schema. "Company" is
  reserved for human-facing screens and the classic customer vocabulary. An
  Organization may not have a known legal structure (e.g., sole trader) — it
  still exists as an Organization.
- **Examples:** "Acme Manufacturing GmbH", "Acme Manufacturing — UK entity".

### Branch

A physically or operationally distinct unit of an Organization.

- **Definition:** A distinct location, subsidiary-like unit, or operating
  division of an Organization, carrying its own contactable address and/or
  contact details while remaining legally or commercially part of the parent.
- **Purpose:** Allows the platform to model organizations that operate in many
  places or under multiple names, so search and enrichment can target the
  correct unit.
- **Relationships:**
  - Belongs to exactly one **Organization**.
  - Has its own **Address** (and Contact Methods).
  - May have its own **Website** or **Social Profiles** where the branch has an
    independent digital presence.
- **Notes:** A Branch is never orphaned — no Branch without an Organization.
  Branch identity may rely on the parent + name/address for matching; this is a
  source of **Duplicate Candidates**.
- **Examples:** "Acme Manufacturing — Berlin office", "Acme Manufacturing —
  Munich plant".

### Address

A structured, validated postal or geographic location.

- **Definition:** A normalized postal location composed of structured fields
  (street, number, postal code, city, region, country) and optional
  coordinates, validated against reference data where possible.
- **Purpose:** Provides unambiguous, queryable, deduplicable location data used
  for geo-searching and for validating that a physical unit actually exists.
- **Relationships:**
  - Attached to **Organizations**, **Branches**, and optionally **Persons**
    (business address).
  - Referenced by **Verification** results (address confirmed / not confirmed).
- **Notes:** An Address is stored once and reused; identical physical locations
  should not be duplicated as separate Address rows. Free-text location input
  must be normalized into this structure before use.
- **Examples:** `{ street: "Hauptstrasse 1", postalCode: "10115", city:
  "Berlin", country: "DE" }`.

### Person

A human being who is a point of contact within or related to an Organization.

- **Definition:** An individual who is the human subject of research and
  outreach: an employee, owner, or decision-maker associated with one or more
  Organizations.
- **Purpose:** The platform targets people as the human decision-makers inside
  the organizations it researches.
- **Relationships:**
  - Owns one or more **Contact Methods** (email, phone, etc.). The Person is
    the owner; Contact Methods are attributes of the Person.
  - Linked to one or more **Organizations** (employment/history).
  - Subject of **Verifications**, **Duplicate Candidates**, and **AI
    Insights**.
  - May be referenced by **Tasks** and **Activities**.
- **Notes:** A Person is never called a "Contact" in the data model — "Contact"
  is forbidden (see Project Vocabulary Rules). Two Person records may refer to
  the same human; that is a **Duplicate Candidate**, not a re-used Person.
- **Examples:** "Ada Lovelace", "Alan Turing".

### Contact Method

A reachable channel that belongs to a Person (or, rarely, an Organization or
Branch) — never a person itself.

- **Definition:** A typed, validated channel through which a Person can be
  reached, such as a business email address or a phone number. It is an
  attribute owned by a subject, not a subject in its own right.
- **Purpose:** Decouples "who" from "how to reach them". People change channels
  (new email, new phone); the Person stays the same.
- **Relationships:**
  - Belongs to exactly one owner: typically a **Person**; also usable by
    **Organization** or **Branch** for general office channels.
  - A **Person may own multiple Contact Methods**, including multiple of the
    same type.
  - **Verification** records whether a Contact Method is deliverable/valid.
  - **Duplicate Candidates** often match on Contact Method equality.
- **Notes:** The single most violated rule in CRM-style models is treating a
  Contact Method as a person. An email address is not a person; a phone number
  is not a person. Activities and tasks are never performed "against" a Contact
  Method as the subject.
- **Examples:** `ada@acme.com` (type: email), `+49 30 555 0100` (type: phone),
  `@ada_at_acme` (type: handle — this belongs to Social Profile scope, see
  below).

---

## Digital Presence

### Website

The primary web domain owned by or representing an Organization, Branch, or
product.

- **Definition:** A web domain (and its canonical URL) that is used to
  identify, verify, or research an Organization or Branch, optionally with
  captured metadata (title, description, technologies, existence status).
- **Purpose:** A domain is a stable, near-unique key for identifying and
  verifying an organization, and a rich source for enrichment (from page
  content, DNS, and related signals).
- **Relationships:**
  - Belongs to an **Organization** or **Branch**.
  - **Independent from Social Profiles** — a Website is not a Social Profile and
    vice versa; they are sibling digital-presence entities.
  - Feeds **Verification** (does the domain resolve, does the organization
    really exist there).
- **Notes:** One organization can have several websites (e.g., country
  domains). A Website is a domain-level concept, not a per-page concept.
- **Examples:** `acme.com`, `acme.de`.

### Social Profile

A presence owned by an Organization, Branch, or Person on a third-party social
or professional network.

- **Definition:** A verified or claimed account/handle on a platform such as
  LinkedIn, X, Facebook, or Instagram, referencing that platform's identifier
  (handle, vanity URL, or numeric profile ID).
- **Purpose:** Enriches the platform's view of an entity (who they are, what
  they publish, how active they are) and supports outreach channels.
- **Relationships:**
  - Belongs to an **Organization**, **Branch**, or **Person**.
  - **Independent from Website** — a Social Profile has its own platform
    context, URL, and validity; it is not a subset of a Website.
  - **Verification** can confirm or refute that a profile genuinely belongs to
    the claimed entity.
- **Notes:** Each Social Profile carries its platform type. The same person's
  handle on two networks is two Social Profiles. Contact handles on messenger
  channels are Contact Methods; public profile pages are Social Profiles.
- **Examples:** `linkedin.com/company/acme`, `x.com/@acme`.

---

## Classification

### Category

A coarse, curated business classification applied to an Organization.

- **Definition:** A controlled, product-managed label (industry, business type,
  size band) from a fixed taxonomy that an Organization may be assigned.
- **Purpose:** Enables high-level segmentation, filtering, and reporting.
  Categories are curated, not free-form.
- **Relationships:**
  - Applied to **Organizations** (and optionally **Branches**).
  - Distinct from **Tags**: a Category is a bounded, managed set.
- **Notes:** Categories are a closed set managed by the platform; they are not
  invented by end users. Changing the taxonomy is a product change.
- **Examples:** "Manufacturing", "IT Services", "Retail".

### Tag

A free-form, user-defined label applied to any research object.

- **Definition:** A lightweight, user-created keyword that can be attached to
  Organizations, Persons, Leads, and other objects for personal organization.
- **Purpose:** Lets teams classify and group data beyond the controlled
  Category taxonomy.
- **Relationships:**
  - Many-to-many with **Organizations**, **Persons**, **Leads**, and other
    research objects.
  - Complementary to **Category** (curated vs. free-form).
- **Notes:** Tags are unconstrained and user-generated; they must not be used
  for queries that require data integrity. Tags follow the platform's tag
  normalization rules (case, trim, allowlist of characters).
- **Examples:** "strategic-account", "north-america", "dormant".

---

## Engagement & Opportunity

### Activity

A recorded interaction or event on the platform, with a subject.

- **Definition:** An auditable, timestamped event representing an interaction
  with or about an entity — an email sent, a call logged, a page visited, a
  note attached, a system event.
- **Purpose:** Provides the historical narrative and auditability of everything
  that happened to a Person, Organization, or Lead.
- **Relationships:**
  - Scoped to a subject: **Organization**, **Branch**, **Person**, or **Lead**.
  - May be created manually, by a **Workflow**, or by an **Automation Job**.
  - Can reference a **Task** it fulfills.
- **Notes:** Activities are append-only facts about the past. They are never
  edited in place to tell a different story; corrections add a new activity.
  An Activity is the log of *what happened*; a **Task** is the plan of *what
  should happen*.
- **Examples:** "Call logged with Ada Lovelace (12m)", "Email opened",
  "Website visited", "Note added to Acme".

### Task

A unit of planned work owed to a user, with a due date and state.

- **Definition:** A to-do assigned to a **User** with a subject, a due date, a
  state (open/done/cancelled), and an optional priority — either created by a
  human or generated by a **Workflow**.
- **Purpose:** Translates insights, leads, and workflow triggers into concrete,
  trackable human action.
- **Relationships:**
  - Assigned to a **User**.
  - Scoped to a subject (**Organization**, **Person**, **Lead**).
  - Created by a human or by a **Workflow**.
  - Completion records an **Activity**.
- **Notes:** Tasks are about the future (planned); Activities are about the
  past (happened). A Task is not a Lead and is not a Person.
- **Examples:** "Follow up with Acme by Friday", "Verify contact email for Ada
  Lovelace".

### Lead

A researched entity deemed a candidate for outreach or business development.

- **Definition:** A qualified research target — an **Organization** and/or
  **Person** (or a discovered one) that has been flagged, scored, or assigned
  as a sales/marketing candidate, with its current status in the qualification
  funnel.
- **Purpose:** Separates "interesting data" from "target we are actively
  pursuing". This is the platform's bridge from intelligence to outreach.
- **Relationships:**
  - Wraps a subject (**Organization** and/or **Person**) plus lead metadata
    (score, source, owner).
  - Moves through a **Pipeline** (status changes are audited).
  - May be created by a **Search Job**, an **Automation Job**, an **AI
    Suggestion**, or manually.
- **Notes:** A Lead is a role a subject plays for a given team/workspace, not a
  new copy of the subject. Do not duplicate the underlying Person/Organization
  per lead. Unlike a traditional CRM, a Lead here is usually created from
  external research data, not from a form fill.
- **Examples:** "Acme Manufacturing flagged as target for the DACH team".

### Pipeline

A defined sequence of stages a Lead passes through toward qualification.

- **Definition:** A named, ordered set of stages (e.g., New → Contacted →
  Engaged → Qualified → Won / Discarded) that defines how leads progress and
  what state transitions are legal.
- **Purpose:** Standardizes lead progression, enables reporting, and constrains
  state changes so the funnel is measurable.
- **Relationships:**
  - Owns the stages that **Leads** occupy.
  - Stage transitions are recorded as auditable events.
  - Pipelines may be template-driven (per team) but the platform ships a
    default.
- **Notes:** A Pipeline is configuration, not data per lead. Legal transitions
  are enforced by the domain, not by the UI.
- **Examples:** "Outbound pipeline: New → Contacted → Engaged → Qualified →
  Closed".

---

## Data Ingestion

### Search Job

A scheduled or one-off research query that discovers new entities.

- **Definition:** A parameterized research request (keywords, filters, geo
  scope, sources, limits) executed by the platform to discover and import
  Organizations and Persons into the working set.
- **Purpose:** The primary discovery mechanism of a sales intelligence
  platform: continuously finding new targets from external sources.
- **Relationships:**
  - Produces **Raw Imports**.
  - Owned by a **User** or template; may be scheduled or ad-hoc.
  - Results feed deduplication, **Verification**, and **Lead** creation.
- **Notes:** A Search Job is a query definition and its executions; one Job can
  run many times. Results are data, but the Job definition is configuration.
- **Examples:** "Find manufacturing companies > 50 employees near Munich".

### Raw Import

A batch of unprocessed records captured from a source.

- **Definition:** A bulk set of records as received from an **Import Source**
  before normalization, deduplication, and enrichment have been applied.
- **Purpose:** Preserves what the source actually said, making enrichment and
  deduplication reproducible and auditable.
- **Relationships:**
  - Produced by a **Search Job** or direct upload.
  - Originates from one **Import Source**.
  - Consumed by processing pipelines that produce deduplicated, verified
    entities.
- **Notes:** Raw Imports are immutable snapshots of source data. They may be
  large; they are never edited — they are reprocessed instead.
- **Examples:** "500 rows from source 'web-directory-munich' on 2026-01-15".

### Import Source

The origin of data entering the platform.

- **Definition:** A named, configured origin of data — a licensed data
  provider, a public web source, a file upload channel, or an integration —
  with its own identity, reliability metadata, and (optionally) a license/use
  policy.
- **Purpose:** Tracks provenance so every record can be traced to where it came
  from, how reliable it is, and whether we may use it.
- **Relationships:**
  - Originates **Raw Imports**.
  - Contributes to trust/quality scoring of derived entities.
- **Notes:** Provenance is non-negotiable in sales intelligence: a datum
  without a source is untrustworthy. Source reliability feeds **Data Quality**.
- **Examples:** "DACH business directory (licensed)", "Public company registry",
  "CSV upload".

---

## Data Quality

### Verification

An audited check that a piece of data is true.

- **Definition:** A recorded determination — with actor, method, and timestamp
  — that a fact (address exists, email is deliverable, social profile is real,
  person still works there) is true or false.
- **Purpose:** Separates claims (source said so) from confirmed facts, and
  prevents stale or invented data from entering the platform.
- **Relationships:**
  - Applies to **Addresses**, **Contact Methods**, **Websites**, **Social
    Profiles**, **Persons**, and their links to **Organizations**.
  - Methods may be automated (mail-server check, DNS check) or manual (human
    review).
  - Results feed **Data Quality** scores.
- **Notes:** **Verification is always auditable**: who/what verified, using
  which method, when, and the outcome — always recorded. A failed verification
  does not delete data; it demotes its status.
- **Examples:** "email deliverable — verified via SMTP handshake by system at
  14:02", "address confirmed — by user J. on 2026-01-20".

### Duplicate Candidate

A pair of records that may represent the same real-world entity.

- **Definition:** A detected pair (or group) of **Organizations** or
  **Persons** whose attributes match within configured thresholds and are
  therefore probable duplicates awaiting confirmation.
- **Purpose:** Prevents the platform's most costly data problem: the same
  company or person appearing twice, which corrupts search, counts, and
  outreach.
- **Relationships:**
  - Refers to two or more **Organizations** or **Persons**.
  - Resolution (merge, keep-separate) is a reviewed, audited action.
  - Created by the deduplication engine, which uses **Verification** results.
- **Notes:** A Duplicate Candidate is a *suggestion*, not a decision. Merges
  are destructive to history and therefore gated and audited.
- **Examples:** "Acme GmbH (from source A) vs. Acme Manufacturing GmbH (from
  source B) — same address and phone".

### Data Quality

The measured trustworthiness of a record or dataset.

- **Definition:** A composite measure of a record's completeness, accuracy,
  freshness, and source reliability, surfaced as a score and/or status.
- **Purpose:** Lets users (and the system) decide how much to trust a record
  before acting on it — outreach based on bad data wastes money and reputation.
- **Relationships:**
  - Aggregates outcomes of **Verification**, **Import Source** reliability,
    record age, and completeness.
  - Affects which records are surfaced and how they are ranked.
  - Alerts feed back into **Verification** and re-enrichment jobs.
- **Notes:** Data Quality is a derived, recomputable value — never a manually
  edited field. It is the guardrail for everything downstream.
- **Examples:** "Contact email quality: HIGH (verified, fresh, source
  reliable)".

---

## AI

### AI Insight

An analytical statement about data, derived by AI.

- **Definition:** A read-only, explainable observation produced by an AI model
  about an entity or dataset — e.g., "this company shows hiring growth", "this
  person likely changed roles" — with supporting reasoning.
- **Purpose:** Turns raw intelligence into actionable understanding that helps
  users prioritize who to pursue and how.
- **Relationships:**
  - Scoped to an **Organization**, **Person**, **Branch**, **Lead**, or
    dataset.
  - Complements, never overwrites, **Verification** and measured **Data
    Quality**.
- **Notes:** Insights are recommendations, not facts. They are labeled as
  AI-generated, versioned by model, and never written into verified fact
  fields. **AI never edits data directly.**
- **Examples:** "Acme hiring engineers for 3 consecutive months — likely
  expanding".

### AI Suggestion

A proposed action or change to data, generated by AI, awaiting approval.

- **Definition:** A concrete, reversible proposal — "merge these two records",
  "update this phone number", "assign category X", "create lead for Acme" —
  produced by AI and pending human or audited-job approval.
- **Purpose:** Lets AI accelerate work without ever mutating data unilaterally.
- **Relationships:**
  - References the target entity (**Organization**, **Person**, **Lead**).
  - When approved, the change executes as an audited action (recorded in the
    **Audit Log**); when rejected, it is discarded with its rationale.
- **Notes:** This is the enforcement mechanism for the rule "AI never edits
  data directly": AI proposes, approval applies. Suggestion lifecycle (applied
  / rejected / expired) is itself auditable.
- **Examples:** "Suggest merging Acme GmbH and Acme Manufacturing GmbH — 98%
  confidence".

---

## Automation

### Workflow

A declarative business rule that triggers actions based on conditions and
events.

- **Definition:** A configured set of rules (trigger + conditions + actions)
  that reacts to platform events — e.g., "when a Lead enters stage Engaged and
  contact quality is HIGH, assign a follow-up Task to the owner".
- **Purpose:** Encodes repeatable business process so the platform acts
  consistently without manual intervention.
- **Relationships:**
  - Triggers on **Events**/**Activities**, **Lead** stage changes, **Data
    Quality** changes.
  - Creates **Tasks**, **Activities**, leads, and outbound actions.
  - Executes through **Automation Jobs**.
- **Notes:** A Workflow is definition/configuration; its concrete executions
  are Automation Jobs. Workflows are versioned — changing a rule must not
  retroactively rewrite history.
- **Examples:** "New verified lead → create task for owner + log activity".

### Automation Job

A concrete execution instance of a Workflow (or scheduled job).

- **Definition:** A recorded run of a **Workflow** or a scheduled batch process
  (such as re-verification sweeps), with start time, result, and any produced
  effects.
- **Purpose:** Makes automation observable and debuggable: what ran, when, why,
  and what it did.
- **Relationships:**
  - Belongs to one **Workflow** or schedule.
  - May create **Tasks**, **Activities**, **Leads**, or external calls.
  - Every side effect is traced in the **Audit Log**.
- **Notes:** Jobs must be idempotent where possible and always retryable
  without duplicating effects. A failed job is visible, not silent.
- **Examples:** "Run #482 of workflow 'new-lead-followup' at 09:00 — 12 tasks
  created".

---

## Access & Governance

### User

A human actor authenticated to the platform.

- **Definition:** A registered account (person or service identity) that can
  authenticate, act within the platform, and be held accountable for those
  actions.
- **Purpose:** Identifies who performs actions, enabling authorization,
  personalization, and auditability.
- **Relationships:**
  - Is assigned one or more **Roles**.
  - Creates and owns **Tasks**, **Leads**, **Search Jobs**, **Workflows**.
  - Every action a User takes is attributable via the **Audit Log**.
- **Notes:** A User is a platform identity. The platform's researched "Person"
  (a data subject) is a different concept — do not conflate them (see Project
  Vocabulary Rules).
- **Examples:** "ada@platform.internal — data analyst".

### Role

A named set of permissions granted to a User.

- **Definition:** A container of **Permissions** (e.g., `ADMIN`, `MEMBER`,
  `GUEST`) that a **User** is assigned, possibly scoped to a workspace or
  organization.
- **Purpose:** Implements Role-Based Access Control with sensible defaults and
  no scattered authorization branches.
- **Relationships:**
  - Assigned to **Users**.
  - Composed of **Permissions**.
  - Scoped: a Role may grant access to one workspace/org, not globally.
- **Notes:** Roles are granted, never guessed from a field on the User. Default
  deny applies — a Role only allows what its Permissions list says.
- **Examples:** "ADMIN — full access incl. data merges", "MEMBER — search and
  outreach within own workspace".

### Permission

The smallest unit of a user's right to perform an action.

- **Definition:** An atomic, named right (e.g., `lead.create`, `company.merge`,
  `automation.configure`) that is checked before an operation executes.
- **Purpose:** Provides granular, auditable authorization instead of coarse
  "is admin?" checks.
- **Relationships:**
  - Composes **Roles**.
  - Checked by guards and use-cases.
  - Denied permission attempts are audit-logged.
- **Notes:** Permissions are centralized in the access model; ad-hoc checks in
  controllers are forbidden.
- **Examples:** `contact_method.verify`, `data.merge`, `workflow.edit`.

### Audit Log

An append-only record of meaningful actions taken on the platform.

- **Definition:** An immutable, timestamped record of actions — who (actor),
  what (action + entity), when, before/after state, and correlation ids —
  covering auth events, data changes, verifications, merges, and automation
  runs.
- **Purpose:** Makes the platform accountable and forensic: every state change
  can be traced to its cause, and every verification is provable.
- **Relationships:**
  - Records actions by **Users**, **Automation Jobs**, and system processes.
  - Covers **Verification** outcomes (mandatory), **Duplicate Candidate**
    resolutions, and permission denials.
  - Correlated by `requestId` and scoped by entity.
- **Notes:** Append-only. Entries are never edited or deleted. Retained per the
  platform's retention policy.
- **Examples:** `{ actor: "user:ada", action: "contact_method.verify",
  subject: "person:ada-lovelace", outcome: "verified", at: "2026-01-20T14:02:01Z" }`.

---

## Project Vocabulary Rules

These rules govern every field, file, endpoint, and UI label. When two words
could mean the same thing, pick the preferred one and never use the other.

### Forbidden ambiguous words

| Forbidden | Reason | Use instead |
|---|---|---|
| **Contact** (as a noun for a person) | Ambiguous: person vs. channel | `Person`, or `Contact Method` for the channel |
| **Account** (for an organization) | Overloaded with login/accounting meanings | `Organization`, `User` |
| **Client** | Implies a customer of our customer | `Organization` |
| **Company** | Casual; conflicts with `Organization` in code | `Organization` in code; `Company` only in UI text |
| **Site** | Ambiguous: website vs. location | `Website`, `Branch` |
| **Profile** (bare) | Ambiguous: social profile vs. person record | `Social Profile`, `Person` |
| **Job** (bare) | Ambiguous: search vs. automation vs. async task | `Search Job`, `Automation Job`, `Task` |
| **Address** as free text | Must be structured | Normalized `Address` entity |
| **Email / Phone** as subject | A channel is not a subject | `Contact Method` (owned by a `Person`) |
| **Status** (bare) | Meaning differs by entity | `lead.status`, `verification.outcome`, `task.state` |
| **Source** (bare) | Ambiguous: import source vs. data origin vs. code | `Import Source` |

### Preferred terminology

- **Organization** (not Company/Account/Client) — singular `organization` in
  schema.
- **Branch** — one Organization, many Branches.
- **Person** — the human; never "Contact".
- **Contact Method** — the reachable channel owned by a Person.
- **Website** and **Social Profile** — independent digital-presence entities.
- **Lead** — the research target wrapper; never the underlying Person/Org copy.
- **Pipeline** — the stage configuration leads move through.
- **Search Job / Raw Import / Import Source** — the ingestion trio; keep
  "Import" in all provenance names.
- **Verification / Duplicate Candidate / Data Quality** — the data-integrity
  trio.
- **AI Insight / AI Suggestion** — Insight = read-only observation; Suggestion
  = proposed change awaiting approval.
- **Workflow / Automation Job** — definition vs. executed instance.
- **User / Role / Permission / Audit Log** — access & governance set.

### Naming consistency rules

1. **One concept, one name.** If two files/fields say different things for the
   same concept, rename, don't alias.
2. **Schema names mirror glossary names.** Table/field names follow the
   preferred terminology above (`organization`, `contact_method`,
   `duplicate_candidate`, `search_job`, `automation_job`).
3. **Entities end with a clear role.** A table must map to exactly one glossary
   term; a term must map to at most one primary table.
4. **Action verbs are owned by one entity.** `verify*` belongs to Verification;
   `suggest*` to AI Suggestion; `merge*` to Duplicate Candidate resolution;
   `automate*` to Workflow/Automation Job.
5. **No synonym drift in endpoints.** URL segments use the glossary terms
   (`/organizations`, `/contact-methods`, `/search-jobs`), never synonyms.
6. **UI labels may soften terms, code may not.** "Company" is acceptable on
   screens; `company` is forbidden in code/schema.
7. **Attribute naming is scoped.** Use `is_*`/`has_*` for booleans, `*_at` for
   timestamps, `*_id` for FKs — matching the vocabulary (`verified_at`,
   `merged_by_id`).
8. **When in doubt, add a glossary entry.** Introducing a term that is not in
   this document requires updating this glossary in the same change.

---

## Summary

This glossary establishes a single, sales-intelligence-native vocabulary for the
Digital Wave platform. It distinguishes the platform from a traditional CRM in
its core framing: external data is ingested (`Search Job → Raw Import → Import
Source`), guarded for trust (`Verification`, `Duplicate Candidate`, `Data
Quality`), augmented by advisory AI (`AI Insight`, `AI Suggestion`), and acted
upon through scoped engagement (`Lead`, `Pipeline`, `Task`, `Activity`) and
configuration-driven automation (`Workflow`, `Automation Job`) — all under
auditable governance (`User`, `Role`, `Permission`, `Audit Log`). The enforced
semantic rules (Contact Method is not a Person; Website independent from Social
Profiles; AI never edits data directly; Verification always auditable; one
clear responsibility per entity) are the invariants the future data model must
satisfy.

## Total glossary terms

**27**

(Organization, Branch, Address, Person, Contact Method, Website, Social
Profile, Category, Tag, Activity, Task, Lead, Pipeline, Search Job, Raw
Import, Import Source, Verification, Duplicate Candidate, Data Quality, AI
Insight, AI Suggestion, Workflow, Automation Job, User, Role, Permission,
Audit Log)

## Missing business concepts to add before database design

1. **Workspace / Tenant** — multi-tenancy boundary for Roles, Leads, and
   Pipelines is referenced repeatedly but not defined as an entity; required
   before any RBAC schema.
2. **Organization ↔ Person relationship** (employment, role/title, current vs.
   historical) — implied by Persons but not a named entity; needed for data
   model and for Verification scope.
3. **Enrichment / Data Enrichment job** — filling gaps (technologies, financials,
   hiring) is core sales-intelligence behavior but is not defined as a job type.
4. **Scoring / Lead Score** — "qualified" and ranking are referenced; a defined
   scoring concept (model, version, recomputation) is required for Pipeline
   semantics.
5. **External platform / Integration** — third-party systems that receive
   automation output (email, dialer, CRM export) are not defined; distinguishes
   this platform from a CRM that *is* the system of action.
6. **Event** (as a first-class trigger for Workflows) — Workflows "react to
   events"; the event type is currently implicit.
7. **Feedback / Human correction** — how users confirm or correct data feeds
   Verification and Data Quality; needed for the data-integrity loop.
8. **Subscription / License scope** — usage boundaries (records, credits,
   sources) that govern Search Jobs and Raw Imports; a commercial, not just
   technical, concept the model must respect.
9. **Deletion & retention policy** — soft-delete semantics and audit retention
   are mandated by DATABASE_RULES.md and SECURITY.md but have no governing
   concept here.
