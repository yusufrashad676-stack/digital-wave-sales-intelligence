# ERROR_HANDLING.md

## Purpose

This document defines how errors are raised, propagated, translated to HTTP,
and logged across the backend. Consistent error handling is what keeps
controllers thin, clients informed, and production debugging possible without
leaking internals.

## Error Taxonomy

Every error falls into one of four categories:

| Category            | Meaning                                     | Default HTTP |
|---------------------|---------------------------------------------|--------------|
| Validation error    | Input does not satisfy the DTO contract     | 400          |
| Business error      | Input is valid but violates a domain rule   | 409 / 422    |
| Authentication /    | Missing/invalid credentials or permissions  | 401 / 403    |
| Authorization error |                                             |              |
| Unexpected error    | Anything not covered above (bugs, infra)    | 500          |

## Global Exception Handling

- A single global **exception filter** in `common/filters/` intercepts every
  thrown error and maps it to the standard error response (API_GUIDELINES.md).
- The filter is registered once in the bootstrap (`app.useGlobalFilters`) and
  is the only place that maps exceptions to HTTP.
- Controllers and use-cases **do not** wrap errors in `try/catch` to build
  responses. They throw; the filter responds.

```ts
// main.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

## Domain / Business Errors

- Business and authorization failures are modeled as **typed domain exceptions**
  in `common/exceptions/`.
- Use-cases throw these exceptions; they carry a stable machine-readable code
  and a safe human message.

```ts
export class BusinessRuleException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = 'BusinessRuleException';
  }
}
```

```ts
// application/use-cases/create-order.usecase.ts
if (order.total < 0) {
  throw new BusinessRuleException('INVALID_ORDER_TOTAL', 'Order total cannot be negative');
}
```

- Existing, known 4xx outcomes must map to the correct status:
  - Not found → 404 (`NotFoundException`).
  - Unique conflict → 409 (`ConflictException`).
  - Auth failure → 401; permission failure → 403.
- Prefer throwing typed exceptions over returning error objects or `null`
  sentinels from use-cases.

## Validation Errors

- The global `ValidationPipe` (whitelist + forbidNonWhitelisted, see
  API_GUIDELINES.md) produces structured field errors.
- Validation failures return `400` with a `details` array identifying each
  field, its failing constraint code, and a safe message:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      { "field": "email", "code": "isEmail", "message": "email must be an email" }
    ]
  }
}
```

- Business-rule validation that depends on persisted state happens in the
  use-case and is thrown as a business error (422), not as a DTO error.

## Unexpected Errors

- Anything unhandled surfaces as `500` with the generic shape — **never** the
  real error message:

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong" } }
```

- The global filter catches `Error`/unknown values, logs the full detail
  server-side, and returns the sanitized response.
- Never let framework defaults (e.g. raw exception text, HTML error pages) reach
  the client.

## Logging Strategy

- Use the application logger abstraction (`common/`), not `console.*`.
- Correlation: attach a `requestId` (from `cls`/context, propagated into logs)
  so a client-reported error maps to its log trail.
- Log levels:
  - `debug` — request/response bodies only when explicitly enabled.
  - `info` — lifecycle and access events.
  - `warn` — recoverable anomalies (rate limits, retries).
  - `error` — thrown unexpected errors, with stack trace **server-side only**.
  - `fatal` — process-threatening failures.
- **Every thrown unexpected error is logged once**, at the point of
  interception, with: `error.name`, `message`, `stack`, `requestId`, route,
  userId (if known), and timing.
- Business/validation errors are logged at `warn`/`info` — they are expected
  flows, not exceptions to page on.
- Log data must be redacted: no passwords, tokens, PII payloads, or query
  parameters in logs (see SECURITY.md).
- Structured JSON logs in production for machine-readable aggregation.

## Never Expose Stack Traces

- Stack traces are for developers, not clients.
- `NODE_ENV=production` enforces sanitized responses; the filter never includes
  `stack` in the HTTP body regardless of environment.
- Internal identifiers (database row ids, internal model names) must not appear
  in error messages or `details`.
- External service errors are wrapped: log the underlying error, return a
  sanitized `code` (e.g. `AI_PROVIDER_UNAVAILABLE`), never the vendor message.

## Error Codes — Naming

- **UPPER_SNAKE_CASE**, scoped tokens: `VALIDATION_ERROR`,
  `RESOURCE_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`, `FORBIDDEN`,
  `UNAUTHORIZED`, `INTERNAL_ERROR`, `RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE`.
- Codes are stable public contract; renaming a code is a breaking change.
- Registry lives in `common/exceptions/codes.ts` to prevent typos and allow
  cross-team reference.

## What We Never Do

- ❌ `try/catch` in controllers to translate errors.
- ❌ Returning `null`/`undefined`/magic values to signal failures from
  use-cases.
- ❌ `catch {}` or `catch (e) { /* nothing */ }`.
- ❌ Stack traces, SQL, or internal types in any client-facing body.
- ❌ `console.log` in shipped code.
- ❌ Logging passwords, tokens, secrets, or raw request bodies by default.
- ❌ Throwing raw `Error('message')` with user-visible strings as HTTP text —
  always go through typed exceptions.
- ❌ Letting NestJS default exception responses (HTML/text) leak in production.
