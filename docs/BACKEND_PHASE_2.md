# Backend Phase 2 — Internal Authentication

Status: implementation report, 2026-09-12.

## Objective

Replace the frontend-only identity mock with a small server-side internal authentication boundary. This phase adds persistence and session security only; it does not implement Company Context HTTP APIs or any marketing/content domain.

## Implemented scope

- `companies`, `users`, and `auth_sessions` Prisma models and PostgreSQL migrations.
- Argon2id password hashing and safe operator bootstrap command.
- Opaque random HttpOnly session cookie (`shifd_session`), with only SHA-256 token hashes persisted.
- Session idle and absolute expiry, active-user checks, revocation, and sliding idle refresh.
- CSRF secret hash persistence with raw token returned only by login and `/auth/me`; `/auth/me` rotates it.
- Validated Origin protection for login/logout and configured CORS credentials support.
- Fastify authentication boundary that loads `request.auth`; routes do not parse cookies or query sessions themselves.
- Configurable login rate limiting using `@fastify/rate-limit`.
- Exactly `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`; no signup or password reset API.

## Files changed

- `backend/package.json`, `backend/package-lock.json`, `.env.example`, and `README.md`.
- `backend/src/config/env.ts`, `src/app.ts`, shared error mapping.
- `backend/src/modules/auth/{crypto,password,session,protection,plugin,routes,bootstrap}.ts`.
- `backend/prisma/schema.prisma`.
- `backend/prisma/migrations/20260912151929_auth_foundation/migration.sql`.
- `backend/prisma/migrations/20260912152200_users_email_case_insensitive/migration.sql`.
- `backend/prisma/migrations/20260912152654_normalize_company_columns/migration.sql`.
- `backend/tests/{app,config,database,auth}.test.ts`.

## Dependency changes

Added `@fastify/cookie`, `@fastify/rate-limit`, and `argon2`. Prisma CLI and Prisma Client remain on matching 6.19.3 versions; CLI remains development-only.

## Database migration

The first real migration creates only `companies`, `users`, and `auth_sessions`, followed by reviewed migrations for the PostgreSQL expression index `LOWER(users.email)` and normalized company column names. All three migrations were applied to the local PostgreSQL 16 Docker Compose database and `prisma migrate status` reports the schema up to date. No Phase 3+ tables were added.

## Bootstrap

`npm run auth:bootstrap` reads required `BOOTSTRAP_*` values from the local environment, validates email/password presence, hashes with Argon2id, creates one company and founder user transactionally, and safely reports an existing email without creating a duplicate. Passwords are never logged or returned.

## Password and session design

Passwords are stored only as Argon2id hashes. Sessions use cryptographically secure opaque tokens; raw tokens and CSRF values are never persisted. The cookie is HttpOnly, SameSite=Lax, Path=/, with Secure enabled in production. Defaults are `SESSION_IDLE_MINUTES=480` and `SESSION_ABSOLUTE_HOURS=24`; expiry is enforced server-side and idle extension never exceeds the absolute limit.

## CSRF and Origin/CORS

Login and logout require an exact validated `Origin`. Logout also requires `X-CSRF-Token` for an existing session. Authenticated future mutations can reuse the same protection functions. CORS permits only `ALLOWED_ORIGIN` and credentials; wildcard origins remain rejected. Authentication and CSRF are not delegated to frontend storage.

## Rate limiting

Login uses `LOGIN_RATE_LIMIT_MAX=5` requests per `LOGIN_RATE_LIMIT_WINDOW_MINUTES=15` per client IP by default. The limit is configured through runtime environment validation and returns the shared `RATE_LIMITED` envelope.

## Endpoints

- `POST /api/auth/login` — validates credentials, creates a session, sets the HttpOnly cookie, returns the user projection, CSRF token, and expiry.
- `GET /api/auth/me` — requires the session cookie, refreshes idle expiry, rotates CSRF, and returns the authenticated user projection.
- `POST /api/auth/logout` — validates Origin and CSRF, revokes only the current session, and expires the cookie. Repeated logout without a cookie is safe.

All errors use the existing sanitized envelope. Passwords, hashes, cookies, tokens, and stack traces are excluded from responses and request logs.

## Tests and verification

- `npm run db:generate`: passed.
- `npx prisma validate`: passed.
- `npm run db:migrate`: passed against local PostgreSQL 16; three migrations are applied and migration status is up to date.
- `npm run db:deploy`: passed with no pending migrations.
- `npm run test:auth`: passed — 5 database-backed authentication tests.
- `npm run test:db`: remains the safe `SELECT 1` database boundary check.
- `npm run test:unit`: passed — 8 tests passed and database-backed suites are explicitly run with `test:db`/`test:auth`.
- `npm run build`: passed with strict TypeScript.
- `npm audit`: reported 3 High and 2 Moderate advisories. `npm audit --omit=dev` reported 3 High and 0 Critical advisories through the Prisma peer/tooling dependency path (`@prisma/config`/`deepmerge-ts`). Prisma CLI remains a development dependency and the available automated fix would downgrade Prisma to 6.12.0; no downgrade or `npm audit fix --force` was used. This known risk is explicitly accepted for this prototype phase and will be revisited during dependency upgrades.

## Dependency audit

`npm audit` reports 3 High and 2 Moderate advisories. `npm audit --omit=dev` reports 3 High and 0 Critical advisories through the Prisma peer/tooling path (`prisma` → `@prisma/config` → `deepmerge-ts`). The Prisma CLI remains a development dependency and is not application runtime code; the advisory is not technically fixed. The suggested forced remediation downgrades Prisma to 6.12.0 and was not used. This risk is documented for review and must be revisited before production deployment or a future dependency upgrade.

## Deferred items and limitations

Frontend auth integration remains deferred; frontend-v1 behavior is unchanged. There is no role matrix beyond the founder role, password reset, email verification, OAuth, JWT, CSRF cookie endpoint, account management, cleanup job, or production secret manager. Session expiry cleanup is currently lazy on access. Company Context APIs and all Phase 3+ domains remain deferred.

## Readiness

**BACKEND PHASE 2 READINESS: READY FOR REVIEW**

Phase 3 is not started or implied.

# Final QA

QA date: 2026-09-12. This is a read-only verification of the Phase 2 source,
migrations, tests, and local PostgreSQL result. No backend source or frontend
behavior was changed during this pass.

## Migration Review

**PASS.** The Phase 2 business schema contains only `companies`, `users`, and
`auth_sessions` (plus Prisma's `_prisma_migrations` bookkeeping table). All
three tables use UUID primary keys. `users.company_id` owns the company
relationship, `active` defaults to true, and `role` defaults to `founder`.
`password_hash`, `token_hash`, and `csrf_secret_hash` are required columns;
raw passwords, session tokens, and CSRF tokens have no database columns.

`auth_sessions.token_hash` is unique and the user, expiry, and absolute-expiry
indexes are present. The reviewed PostgreSQL expression index
`users_email_lower_unique` enforces `LOWER(email)` uniqueness. Foreign keys use
company `RESTRICT` and session `CASCADE` behavior as intended. `npm run
db:migrate`, `npm run db:deploy`, and `npx prisma migrate status` all report the
local database up to date.

The migrations are forward-only. The company-column normalization migration
uses drop/add statements generated for an empty Phase 2 database; it should be
reviewed as an explicit rename before applying this history to a non-empty
environment so existing values cannot be lost. This is a migration hygiene
limitation, not an authentication invariant failure.

## Password Security

**PASS.** `password.ts` explicitly selects Argon2id for hashing and uses the
same helper from operator bootstrap and login verification. The bootstrap and
login paths never store plaintext, return password fields, or log request
bodies/passwords. The auth response is a narrow user projection and excludes
`passwordHash`.

## Session Security

**PASS.** Login generates a fresh 32-byte cryptographically secure opaque token
and never reuses a caller-provided cookie. Only its SHA-256 hash is persisted;
the raw token is sent through the `shifd_session` cookie. Cookie options are
`HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and `Secure=true` in
production (false only for non-production HTTP development).

A session is accepted only when it is not revoked, both idle and absolute
expiry timestamps are in the future, and the user is active. Accepted requests
refresh the idle expiry while capping it at `absoluteExpiresAt`. Expired or
invalid sessions are rejected as `UNAUTHENTICATED`, and the invalid cookie is
cleared on protected access. The implementation keeps one Prisma client in the
Fastify boundary and disconnects it during application close.

## CSRF Review

**PASS.** CSRF values are generated with the same secure opaque-token helper;
only `csrf_secret_hash` is stored. Login returns a usable raw token, and
`GET /api/auth/me` atomically replaces the stored hash and returns a fresh raw
token. Shared `requireCsrf` protection reads only `X-CSRF-Token`; query-string
tokens are not accepted. Logout requires a valid session and CSRF token when a
session cookie is present. Missing and incorrect tokens return `CSRF_INVALID`.

Known limitation: rotating CSRF on `/auth/me` means two browser tabs can hold
different tokens; after one tab refreshes identity, the other tab's older token
must bootstrap again before a mutation. This is documented behavior and was
not redesigned in this QA pass.

## Origin/CORS Review

**PASS.** CORS uses `@fastify/cors` with credentials enabled and an exact
validated `ALLOWED_ORIGIN`; wildcard origins are rejected during configuration.
The reusable Origin check separately protects the state-changing login and
logout routes. An unapproved Origin receives no permissive CORS headers and
cannot mutate session state. No custom CORS implementation or proxy trust
assumption was added.

## Bootstrap Review

**PASS.** `npm run auth:bootstrap` is a command-only path; there is no bootstrap
HTTP endpoint or public signup. Company and founder-user values are required
from `BOOTSTRAP_*` environment variables, with no hard-coded demo password.
Password hashing uses Argon2id, the company/user creation is transactional,
and duplicate normalized email is reported without creating another pair.
The database expression index provides a second line of defense for concurrent
duplicate attempts. The command prints only safe identifiers and never the
password or hash.

## Test Coverage Matrix

The current automated suite is five PostgreSQL-backed integration tests plus
the Phase 1 HTTP/configuration tests. A status of “PASS — source verified
only” means the invariant is clear in migrations/source but has no dedicated
assertion. “PARTIAL” means automation covers part of the scenario and source
inspection covers the remainder.

| ID | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| A01 | Bootstrap creates Company + Founder | PARTIAL | Auth integration calls bootstrap and verifies retained company/user; founder role is source-verified. |
| A02 | Bootstrap stores Argon2id, not plaintext | PASS — automated | `tests/auth.test.ts` asserts the Argon2id prefix and rejects plaintext. |
| A03 | Duplicate bootstrap/email safe | PARTIAL | Integration asserts no second user; transactional pair behavior is source-verified. |
| A04 | Valid login | PASS — automated | 200 response, projection, cookie, CSRF, and session row are asserted. |
| A05 | Wrong email generic failure | PASS — automated | `INVALID_CREDENTIALS` is asserted. |
| A06 | Wrong password same generic failure | PASS — automated | Same public code as unknown email is asserted. |
| A07 | Inactive user rejected | PASS — automated | User is disabled and login remains 401. |
| A08 | `/auth/me` valid | PASS — automated | Cookie-authenticated request succeeds and returns a rotated token. |
| A09 | Missing/invalid cookie rejected | PASS — automated | Invalid cookie and expired access both return 401. |
| A10 | Idle expiry | PASS — automated | Test expires `expiresAt` and verifies rejection. |
| A11 | Absolute expiry | PASS — automated | Test expires `absoluteExpiresAt` and verifies rejection. |
| A12 | Revoked session | PASS — automated | Revoked row is rejected by `/auth/me`. |
| A13 | Logout revocation/cookie expiry | PARTIAL | Revocation and 204 are automated; cookie-expiry attributes are source-verified. |
| A14 | Missing CSRF | PASS — automated | Logout without header returns 403. |
| A15 | Wrong CSRF | PASS — automated | Invalid header returns 403. |
| A16 | Invalid Origin | PASS — automated | Login and logout with unapproved Origin return 403. |
| A17 | Login rate limit | PASS — automated | Sixth failed request returns 429 with configured test limit. |
| A18 | Sensitive fields absent from response | PARTIAL | JSON projection assertions plus source review; raw cookie/CSRF exclusion is source-verified. |
| A19 | Case-insensitive email database uniqueness | PASS — source verified only | Applied `LOWER(email)` unique index; no dedicated differing-case insert test. |
| A20 | Raw session/CSRF values absent from database | PARTIAL | Raw session hash exclusion is automated; CSRF hash exclusion is source-verified. |

## PostgreSQL Verification

**PASS.** PostgreSQL 16 is running through the Phase 2 Docker Compose service.
The following completed successfully against the real configured database:

- `npm run db:generate`
- `npx prisma validate`
- `npm run db:migrate` (already in sync)
- `npm run db:deploy` (no pending migrations)
- `npx prisma migrate status` (schema up to date)
- `npm run test:db` (1 test passed; real Prisma/Fastify `SELECT 1` boundary)
- `npm run test:auth` (5 tests passed)

No SQLite database was used.

## Build Result

**PASS.** `npm run test:unit` passed with 8 tests and 6 intentionally skipped
database-dependent cases. `npm run build` passed with strict TypeScript and no
new compiler warnings. The QA shell reported Node `v20.20.2`, below the
declared backend engine range (`>=22.11.0 <23`); the suite still completed, but
the supported Node 22 runtime must be used for local/deployment verification.
The preceding Phase 2 verification was recorded on Node 22.11.x.

## Dependency Audit

`npm audit --omit=dev` reports 3 High and 0 Critical advisories through the
known Prisma tooling peer path (`prisma` → `@prisma/config` → `deepmerge-ts`).
The Prisma CLI is in `devDependencies`; `@prisma/client` remains the matching
runtime dependency. The advisory is not technically fixed, no downgrade or
`npm audit fix --force` was used, and the accepted risk will be revisited during
dependency upgrades. Full `npm audit` reports 3 High and 2 Moderate (the
additional Vitest advisory is development-only). No newly identified runtime
Critical vulnerability was found.

## Scope Regression Check

**PASS.** Source and route inspection show no Company Context APIs, Brand/BMC,
Products, Ideas, Content, Assets, Claude, AI request logs, Approval, Schedules,
Publication, Performance, Instagram/LinkedIn/WhatsApp metrics, or frontend auth
replacement. The only application routes are liveness and the three approved
auth endpoints. No credentials, access tokens, or API secrets are present in
the Phase 2 source.

## Remaining Limitations

- Frontend-v1 still uses its mock authentication; frontend replacement is a
  later integration phase.
- CSRF rotation has the documented multi-tab consequence.
- Session cleanup is lazy on access; there is no scheduled expiry cleanup job.
- The role model is intentionally founder-only, with no authorization matrix.
- The company-column migration should receive an explicit rename/data-preserving
  review before a non-empty environment is migrated.
- The accepted Prisma/deepmerge High advisory remains unresolved in tooling and
  must be revisited before production deployment.
- This QA execution environment used Node 20.20.2; use the declared Node
  22.11.x runtime for the supported verification environment.

There is no High-severity authentication defect in the reviewed source, and
the critical invariants are covered by automated tests or explicit source/
migration verification.

**BACKEND PHASE 2 READINESS: READY TO LOCK**

This is a development/thesis implementation readiness statement, not a
production security certification. Phase 3 is not started or implied.
