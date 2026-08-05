# API_GUIDELINES.md

## Purpose

This document defines the REST API contract for the backend. It standardizes
URLs, verbs, status codes, query semantics, and response/error shapes so every
endpoint is predictable for clients and reviewers alike.

## Base Path & Versioning

- All API routes are prefixed with `/api/v1` (`/api/v1/users`).
- Versioning is explicit in the URL. Breaking changes bump the version
  (`/api/v2/...`) while `/api/v1` remains served until the deprecation window
  expires.
- Do not change existing behavior under the same version — add, don't alter.

```ts
// app.module.ts or main.ts bootstrap
app.setGlobalPrefix('api/v1');
```

## URL Naming

- **kebab-case, lowercase**, plural nouns for resources.
- Resources are nouns; actions are HTTP verbs.

| Resource         | URL                |
|------------------|--------------------|
| Users            | `/api/v1/users`    |
| A specific user  | `/api/v1/users/:id`|
| A user's tasks   | `/api/v1/users/:id/tasks` |
| Company branches | `/api/v1/companies/:id/branches` |

- Nested resources follow ownership: `/parents/:parentId/children`.
- Avoid nesting deeper than two levels; beyond that, flatten with query params
  (`?userId=...`).
- No verbs in URLs (`/getUsers`, `/createUser` are forbidden). No file
  extensions in paths.

## HTTP Verbs

| Verb   | Semantics                     | Typical status |
|--------|-------------------------------|----------------|
| GET    | Read (list or single)         | 200            |
| POST   | Create                        | 201            |
| PUT    | Full replace                  | 200            |
| PATCH  | Partial update                | 200            |
| DELETE | Soft-delete a resource        | 200 or 204     |

- Use `PATCH` for partial updates; `PUT` only when the client sends the full
  representation.
- `DELETE` is idempotent: deleting an already-deleted resource returns success
  (200/204), not 404.

## Status Codes

- **200** OK — success with body.
- **201** Created — successful `POST` (include `Location` header when the
  client needs it).
- **204** No Content — successful action with no response body (e.g. DELETE).
- **400** Bad Request — malformed request, validation failed, missing required
  fields (client error, see ERROR_HANDLING.md).
- **401** Unauthorized — missing/invalid credentials. Not about permissions.
- **403** Forbidden — authenticated but not allowed.
- **404** Not Found — resource or route does not exist.
- **409** Conflict — violates a unique constraint or state conflict.
- **422** Unprocessable Entity — syntactically valid but semantically invalid
  business payload (preferred for business-rule failures).
- **429** Too Many Requests — rate limit exceeded.
- **500** Internal Server Error — unexpected failure. Never expose details.

Use 400 for structural validation errors, 422 for business validation, 409 for
conflicts. Do not return 200 for errors with an `error` body.

## Pagination

- **Cursor-based pagination** is the default for large collections
  (stable ordering, O(log n) page seeks).

```
GET /api/v1/tasks?limit=50&cursor=<opaque_token>
```

- **Offset pagination** is allowed for small/admin collections:

```
GET /api/v1/tags?page=1&limit=20
```

- Response envelope includes pagination metadata (see Response Format).
- `limit` is capped (`MAX_PAGINATION_LIMIT`); an invalid `limit`/`cursor` is a
  `400`.

## Filtering

- Filters are query parameters, one per field, snake_case:

```
GET /api/v1/tasks?status=OPEN&assigneeId=abc-123
```

- Operators for range/negation use the `[operator]` suffix convention:

```
GET /api/v1/tasks?createdAt[gte]=2026-01-01&createdAt[lte]=2026-01-31
GET /api/v1/tasks?status[ne]=DONE
```

- Supported operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`,
  `contains` (string substring), `startsWith`.
- Filters map to an explicit DTO; unknown filter params are rejected with `400`.
- Soft-deleted rows are never returned (see DATABASE_RULES.md).

## Sorting

- Query parameter `sort=<field>` with `-` prefix for descending:

```
GET /api/v1/tasks?sort=-createdAt&sort=title
```

- Allowed sort fields are whitelisted per resource; sorting by a non-whitelisted
  field returns `400`.
- Default sort is `-createdAt` unless documented otherwise.

## Searching

- Full-text search is exposed via `q` or `search`:

```
GET /api/v1/contacts?search=Acme
```

- Search semantics are defined per module (the `search` module is the only
  place that implements cross-entity search).
- Always combine with pagination; cap result size.

## Validation

- Every request body is validated against an HTTP DTO (class-validator) by the
  global `ValidationPipe`.
- Unknown/extra properties are rejected (`whitelist: true`,
  `forbidNonWhitelisted: true`).
- Validated query/params also use DTOs — controllers never trust raw
  `@Query()` or `@Param()`.
- Invalid input returns `400` with a structured field-error list (see
  ERROR_HANDLING.md).

## Response Format

- Responses are plain JSON objects. Consistent shapes across endpoints:

```json
{
  "data": {
    "id": "7f0a...",
    "email": "ada@example.com"
  }
}
```

- List responses:

```json
{
  "data": [
    { "id": "7f0a...", "title": "Task A" }
  ],
  "meta": {
    "pagination": {
      "limit": 50,
      "cursor": "next-cursor-token",
      "hasNext": true
    },
    "total": 123
  }
}
```

- `data` holds the payload. `meta` holds metadata (pagination, total, version).
- Timestamps serialize as ISO-8601 UTC strings.
- Enums serialize as their string values. Never return internal codes as
  response fields unless documented.

## Error Format

Consistent error shape for every failure (see ERROR_HANDLING.md for details):

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

- `code` is a stable machine-readable token. `message` is human-readable.
- `details` is optional, used for field/validation errors.
- Never include stack traces, SQL, or internal identifiers in any error body.

## Content Type & Encoding

- `Content-Type: application/json` (UTF-8) for all requests/responses.
- `Accept` honored for JSON only in v1; other media types return `406`.
- No XML, no form-encoded bodies in v1.

## Idempotency

- `DELETE` is idempotent (see Verbs).
- State-changing operations that may be retried by clients (payments,
  automations) accept an `Idempotency-Key` header; duplicate keys return the
  original result without re-executing.

## What We Never Do

- ❌ Version in paths other than `/api/v1`.
- ❌ Verbs in URLs or `RPC`-style endpoints (`/users/activate` is acceptable
  only when it maps to a clear domain action; otherwise prefer `PATCH`).
- ❌ Returning raw Prisma rows as responses.
- ❌ Error messages that reveal stack traces, SQL, or framework internals.
- ❌ Returning `200` with an error body.
- ❌ Accepting `any` request bodies.
- ❌ Unbounded pagination (`?limit=1000000` without a cap).
