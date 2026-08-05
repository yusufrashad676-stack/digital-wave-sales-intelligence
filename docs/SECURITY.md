# SECURITY.md

## Purpose

This document defines the security rules every engineer must follow. Security
is enforced at architecture time (filters, guards, config), not retrofitted.
Any exception requires security review before merge.

## JWT Authentication

- Authentication is **stateless JWT** (Bearer scheme). No server-side sessions
  for API clients.
- Two token types:
  - **Access token:** short-lived (default `900s`), carries subject and claims.
  - **Refresh token:** longer-lived, stored server-side (hashed) and rotated on
    every refresh; one-time use, revocable.
- Tokens are signed with a strong secret from the environment (`JWT_*`, see
  Environment Variables). Secrets are never committed, never in code.
- Claims: `sub` (userId), `iat`, `exp`, `type` (access|refresh), `roles`.
  Never put passwords, tokens, or PII into claims.
- A global `AuthGuard` verifies the Bearer token; the guard is opt-out, not
  opt-in — public routes are explicitly `@Public()`.
- Token revocation: refresh-token rotation plus a server-side denylist for
  logout and compromised-token cases.
- Token lifetime and algorithm are config, not hardcoded.

## Role-Based Access Control (RBAC)

- Authorization is **role-based** at minimum: `ADMIN`, `MEMBER`, `GUEST` (see
  NAMING_CONVENTIONS.md enum example).
- Roles + resource ownership (tenant/workspace scoping) are both enforced —
  being an `ADMIN` never grants access to another tenant's data.
- Enforcement points:
  - Route-level: guards check roles/permissions before the controller runs.
  - Data-level: use-cases receive the caller's context (`userId`,
    `workspaceId`) and repositories always scope queries by that context.
- Permissions are centralized (a roles/permissions table or config) — never
  scattered `if (user.role === 'ADMIN')` branches across controllers.
- Default deny: unknown roles, missing permissions, and unscoped queries fail
  closed.

## Rate Limiting

- All endpoints are rate-limited by the reverse proxy or NestJS
  `@nestjs/throttler` guard (per `IP + user` where available).
- Stricter limits on auth endpoints (login, refresh, password reset) to slow
  brute force.
- Responses respect `429` with `Retry-After` (API_GUIDELINES.md).
- Rate limit values are environment config; test environments use separate
  values.

## Helmet

- `helmet()` is applied globally at bootstrap to set secure HTTP headers
  (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Strict-Transport-Security` behind TLS).
- No route bypasses Helmet headers except by explicit, reviewed exception.

## CORS

- CORS is **origin-allowlisted**, configured via environment
  (`CORS_ORIGINS`), never `*` for credentialed requests.
- Only the domains that host the frontend(s) are allowed.
- `credentials: true` is set only when cookies are used; our JWT API uses
  `Authorization` headers so credentials mode stays strict.

## Input Validation

- Every request body, query, and param is validated against a DTO
  (class-validator) via the global `ValidationPipe`
  (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`).
- Length, type, and format bounds on all string/number fields.
- File uploads (future) are size- and type-allowlisted.
- Never trust client-supplied IDs or ownership claims; always re-derive
  ownership from the authenticated principal.

## Password Hashing

- Passwords are hashed with **bcrypt** (cost factor from config, `>= 12`) or
  argon2id if adopted — never plaintext, never SHA/MD5, never reversible.
- Hashing happens only in the auth infrastructure adapter; hashes never leave
  the persistence layer.
- No password logging, no password in response bodies, no timing-vulnerable
  comparison (bcrypt/argon2 comparison functions only).
- Reset/verification tokens are single-use, short-lived, and hashed in storage.

## Environment Variables & Secrets Management

- No secrets in code, in docs, or in `.env.example` values (names only).
- `.env` is git-ignored; `.env.example` documents names and formats only.
- `config/` is the single reader of `process.env`; validation fails fast at
  boot on missing/malformed variables.
- Production secrets come from the secrets manager (e.g. Vault, AWS Secrets
  Manager) or platform secret injection — not checked into repos, not baked
  into images.
- Rotation: secrets have documented rotation procedure; JWT secrets rotate on
  compromise without service restarts where feasible.

## SQL Injection Prevention

- **All queries go through Prisma Client** — parameterized by construction.
- No string interpolation of user input into queries anywhere.
- `$queryRaw`/`$executeRaw` (rare, reviewed exceptions only) use tagged
  template parameters — never concatenated user input.
- Repository layer is the only place database queries exist (DATABASE_RULES.md).

## XSS Protection

- API returns JSON only; responses are never embedded in HTML.
- No `text/html` responses in v1 (406 otherwise, see API_GUIDELINES.md).
- Free-text fields are stored as data; HTML escaping/rendering is the
  frontend's responsibility — the API never evaluates user content.
- CSP headers (via Helmet) restrict any accidental inline execution.

## CSRF Considerations

- The API is **header-based auth** (Bearer JWT), so classic CSRF (cookie
  riding) does not apply to API calls.
- **Never enable cookie-based auth** for the API. If cookies are ever
  introduced (e.g. SSR), they must be `HttpOnly`, `Secure`, `SameSite=Strict`,
  and CSRF tokens enforced.
- State-changing requests still require the auth header; no CORS-allowed
  origin may perform state changes without it.

## Security Headers

- Enforced via Helmet (see above): `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS in production.
- Response headers are never set per-route ad hoc — configured centrally.

## Audit Logging

- Audit trail covers security-relevant events:
  - Authentication: login success/failure, refresh, logout, password reset.
  - Authorization: permission-denied events.
  - Data: create/update/soft-delete of sensitive entities with actor,
    workspace, before/after, and `requestId`.
- Audit logs are append-only, tamper-evident where regulation requires,
  retained per policy, and never silent (fail-closed on logging errors for
  security events).
- Correlation: every audit entry carries `userId`, `workspaceId` (when
  applicable), `requestId`, timestamp (ISO-8601 UTC), and event code
  (`auth.login.success`).
- Audit logging is a distinct concern from application error logs
  (ERROR_HANDLING.md).

## What We Never Do

- ❌ Committing `.env`, secrets, or any credential to the repository.
- ❌ Logging passwords, tokens, API keys, or full credit-card-like PII.
- ❌ Returning raw database errors or stack traces to clients.
- ❌ Raw SQL with string-concatenated user input.
- ❌ CORS with `*` for credentialed traffic.
- ❌ Cookie-based auth without HttpOnly/Secure/SameSite + CSRF tokens.
- ❌ Role checks that skip tenant/workspace scoping.
- ❌ Serving HTML, XML, or any content type other than JSON in v1.
- ❌ Weak/bare password storage or home-grown crypto.
- ❌ `NODE_ENV=development` defaults leaking into production config.
