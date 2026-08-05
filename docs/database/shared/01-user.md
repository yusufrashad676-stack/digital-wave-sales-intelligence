# 01 — User

Status: Draft v1.0 (Phase 4.1)
Design doc cross-referenced by: DATABASE_REVIEW.md B1, MASTER_ARCHITECTURE.md §5 (CRM surface)

## 1. Purpose

Represents a person with an authenticated identity who operates the platform: initiates
searches, reviews insights, owns tasks, and triggers workflows. The User is the primary
**actor** referenced by audit records and automation.

A User is a platform identity, not a researched entity. Researched people are `Person`
(04-person.md); they must never be confused with Users. A Person may also hold a User
account only when they have a legitimate operational role, and the two are linked
explicitly, never implicitly.

## 2. Responsibilities

- Authenticate into the platform (identity + credentials lifecycle).
- Own and operate search jobs, tasks, activities, and manual verifications.
- Hold a role and receive the permissions attached to that role.
- Serve as the accountable actor recorded against every action taken on their behalf.
- Hold optional per-user preferences (locale, notifications, default scoping).

## 3. Fields

| Field | Type | Description |
|---|---|---|
| id | identifier | Stable, globally unique. |
| email | text | Login identity; platform-managed, case-insensitive canonical form. |
| displayName | text | Human-readable name shown in UI and audit context. |
| status | state | `registered` → `active` → `disabled` (see Lifecycle). |
| roleAssignment | reference | Link to Role via assignment record (Role designed in auth module). |
| workspaceScopes | reference | Optional future links to Workspace/tenant scoping (see 10). |
| preferences | structure | Locale, timezone, notification settings. |
| lastLoginAt | timestamp | Last successful authentication. |
| createdBy / createdAt | audit | Who created this User and when. |
| updatedAt | timestamp | Last mutation. |
| deletedAt | timestamp | Soft-delete marker. |

Authentication credentials are **not** part of this entity's visible fields; they are
managed under the SECURITY.md credential policy and stored only as derived hashes in a
dedicated, restricted structure.

## 4. Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| User → Role (via Role Assignment) | n : m | A User holds one or more Roles; permissions derive from Roles, never stored on the User directly. |
| User → Permission | n : m (through Role) | Indirect; no direct permission grant on User. |
| User → Search Job | 1 : n | A User owns search jobs. |
| User → Task / Activity | 1 : n | A User owns/executes tasks and activities. |
| User → Audit Log (as actor) | 1 : n | Immutable actor reference; must survive User deletion (see 8). |
| User → Manual Verification | 1 : n | A User performs manual verifications recorded in data-quality. |
| User → Workspace (future) | n : m | Membership scoping, not implemented yet. |

## 5. Lifecycle

```
registered → active ⇄ disabled → deleted (soft)
```

- `registered`: identity created, not yet usable (activation pending).
- `active`: can authenticate and act within role permissions.
- `disabled`: can no longer authenticate; record and history retained; audit attribution intact.
- `deleted`: soft delete only; audit rows still point at the frozen actor identity.

Off-boarding is a deliberate, audited sequence: disable → revoke sessions → reassign owned
tasks → then soft-delete. A User with live automation ownership must transfer those first.

## 6. Validation Rules

- Email must be a valid, canonicalizable address; unique across the platform.
- displayName is required and length-bounded.
- Status transitions must follow the allowed lifecycle (no skipping disabled).
- A User cannot be hard-removed while audit records, tasks, or jobs reference them.
- Role assignment must exist before the User is `active`.
- Workspace/tenant fields, when introduced, must not break global identity (a User is one
  identity with multiple scopes, not one identity per scope).

## 7. Soft Delete Strategy

Soft delete with `deletedAt`. Deletion does **not** detach history:

- Owned tasks/jobs are reassigned or closed as part of the off-boarding process **before**
  deletion is permitted.
- Audit actor references remain, pointing at the frozen actor identity.
- A soft-deleted User email may be released for reuse only after a documented review period.

## 8. Audit Requirements

Users are both **actors** and **subjects**:

- As actor: every platform mutation attributable to the User is recorded in Audit Log.
- As subject: account lifecycle events (registration, activation, disable, credential
  reset, deletion) are themselves audited with actor = the agent that performed them.
- The Audit Log keeps an immutable actor identity so that attribution survives account
  changes (renaming, disabling, deletion).

## 9. Index Strategy

- `email`: unique lookup.
- `status`: filtering active vs disabled.
- `lastLoginAt`: inactivity review.
- Role assignment by user: point lookups for permission checks.
- Workspace membership (future): scoping queries.

## 10. Future Scalability

- RBAC scales through Role/Permission assignment; roles are additive, so new capabilities
  do not require schema change per user.
- Multi-tenant readiness: single global identity, per-Workspace memberships and scoping.
- Large user bases need batched lifecycle operations (bulk disable, off-boarding) that do
  not touch historical records.
- SSO/IdP federation should map to this identity without duplicating it per identity
  provider.

## 11. AI Interaction

- AI never creates, edits, or disables User accounts.
- AI may surface operational suggestions (e.g., "this disabled user still owns 3 active
  tasks") as insight events only; humans execute the change.
- Any action taken by AI is recorded under the automation/agent actor type, never under a
  human User.

## 12. Workflow Interaction

- Workflows run **on behalf of** a User (that User is the actor in the Audit Log) or on
  behalf of the platform.
- Task assignment to Users is a workflow outcome (e.g., "task created, assigned to owner").
- Workflows must never change a User's role or credentials; role changes are human-only,
  privileged operations.

## 13. Security Considerations

- Credentials are stored only as hashes under the credential policy; never in this entity.
- Least privilege: permissions only via Roles, denied by default.
- Session and refresh-token lifecycle managed per SECURITY.md; disable immediately revokes
  sessions.
- No researched-entity PII in User records beyond identity/contact needed for operations.
- Privileged operations (role change, disable, delete) are themselves audited and gated.
- Multi-factor and IdP federation are future hardening, anticipated in this design.

## Related Review Decisions

- Covers DATABASE_REVIEW.md B1 item: User/Actor.
- Follows GLOSSARY.md invariant: AI never edits data directly; human accountability.
- Defers to auth module for Role/Permission specifics (not yet designed — see blockers).
