# Backend Phase 1 — Foundation

Status: implementation report, 2026-09-12.

## Objective

Establish a minimal production-shaped Fastify/TypeScript application, validated configuration, shared HTTP errors/request IDs, Prisma/PostgreSQL migration boundary, liveness endpoint, clean shutdown, and focused tests. The frontend remains unchanged and the backend exposes no business domain APIs.

## Implemented scope

- Fastify application factory (`buildApp`) is separate from `server.ts`, so tests use `inject()` without a listener.
- `GET /api/health/live` returns only `{ "status": "ok" }`.
- Fastify request IDs accept `x-request-id` and generate UUID IDs when absent; error envelopes include the ID.
- AppError and sanitized error/not-found handlers cover the documented 400/404/409/412/422/428/429/500 mappings for later commands; Phase 1 exercises 404 and 500.
- Runtime config validates `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, and explicit non-wildcard `ALLOWED_ORIGIN`.
- One PrismaClient is registered in Fastify context and disconnected by the application `onClose` hook.
- PostgreSQL Prisma datasource and migration tooling are present. The temporary technical foundation table has been removed; no domain tables or migrations are present.
- SIGINT/SIGTERM shutdown is idempotent and closes Fastify/Prisma.
- Vitest HTTP/config tests and an optional real-PostgreSQL `SELECT 1` check are present.

## Files added

`backend/package.json`, `package-lock.json` (after install), `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.nvmrc`, `docker-compose.yml`, `README.md`, `AGENTS.md`, `src/app.ts`, `src/server.ts`, `src/config/env.ts`, `src/plugins/prisma.ts`, `src/shared/errors/AppError.ts`, `src/shared/http/errorHandler.ts`, `src/shared/http/notFoundHandler.ts`, `src/modules/health/routes.ts`, `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, and `tests/*.test.ts`.

## Stack and versions

Node.js 22 LTS (engine `>=22.11.0 <23`), strict TypeScript, Fastify 5, Prisma 6 with PostgreSQL, `@fastify/cors`, `dotenv`, `fastify-plugin`, `tsx`, and Vitest. The official Anthropic SDK is intentionally not installed or configured; Claude begins in Phase 6. This is the D-01-approved modular monolith. PostgreSQL-specific constraints remain reviewed SQL migration work for later phases.

## Environment variables

`NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, and `ALLOWED_ORIGIN` are documented in `backend/.env.example`. No secrets, model IDs, upload limits, AI spend limits, retention periods, or session durations are added.

## Database and migration status

Prisma is configured for PostgreSQL. Phase 1 intentionally contains no domain models or migrations; the first real migration will be introduced by the phase that owns the first domain tables. `prisma migrate dev`/`prisma migrate deploy` are canonical; `db push` is not. Real PostgreSQL migration execution is environment-dependent and is reported below.

## Validation results

- `npm install`: passed in `backend/`; package-lock is synchronized with the dependency classification.
- `npm run db:generate`: passed; Prisma Client 6.19.3 generated from the PostgreSQL schema.
- `npx prisma validate` with a placeholder PostgreSQL `DATABASE_URL`: passed. The command requires the variable to be present; no `.env` or credential is committed.
- `npm run test:unit`: passed — 7 tests passed and the optional database test was skipped without a test database; database connectivity is verified separately by `npm run test:db`.
- `npm run build`: passed with strict TypeScript and no new compiler warnings.
- `prisma migrate dev`/`db:deploy`: intentionally not run because there are no domain migrations yet. Migration tooling remains ready for the first domain phase.

## Deferred items

Authentication, users, context, products, ideas, content, assets, AI, approvals, scheduling, publication, performance, integrations, readiness diagnostics, CSRF, and all domain migrations remain deferred. Local-development CORS is implemented as described in the stabilization pass. D-05 phase-specific operational limits remain unset. D-03 creative eligibility will be reassessed before Human Review. D-06 is ratified as the acceptance baseline: locked `frontend-v1`, Implementation Notes, Backend Architecture, Database Schema, API Contract, and documented thesis artifact scope; empty `docs/PRD.md` is not an invented requirements source.

## Known limitations

No real database credentials are committed. No authentication means this foundation is not production-secure by itself.

## Initial Readiness (before stabilization)

The initial readiness statement is superseded by the final closeout below. Phase 2 is not started or implied.

## Stabilization Pass

- **Node runtime:** backend support is locked to Node.js `>=22.11.0 <23`, with `backend/.nvmrc` set to `22.11.0`.
- **CORS:** `@fastify/cors` allows only validated `ALLOWED_ORIGIN` and enables credentials for future HttpOnly sessions. Wildcard origins remain rejected; authentication and CSRF are deferred.
- **Local PostgreSQL:** `backend/docker-compose.yml` provides PostgreSQL 16 only. Use `docker compose up -d`, `docker compose down`, and `docker compose down -v` for start, stop, and reset.
- **Temporary table removal:** `FoundationMetadata`, its Prisma model, and migration were removed. The PostgreSQL migration lock metadata is retained; the first real domain migration is deferred to the phase that needs it.
- **PostgreSQL integration:** verified locally with PostgreSQL 16 started through Docker Compose and a local-only `DATABASE_URL`; `npm run test:db` passed through the real Prisma/Fastify boundary. No domain migration was executed.
- **npm audit:** `npm audit` reported 5 advisories (3 high, 2 moderate). `npm audit --omit=dev` reported 3 high advisories through Prisma's `@prisma/config` dependency (`deepmerge-ts` stack exhaustion path). No `audit fix --force` was used; the available automated fix would downgrade Prisma to 6.12.0 and is not applied without an explicit compatibility decision.
- **Unit tests:** passed — `npm run test:unit` completed successfully.
- **Build:** passed with strict TypeScript.

The CORS tests cover both the configured origin (including credentials) and an unapproved origin without permissive headers. `docker compose config` also validates the PostgreSQL-only development service definition. Local verification used Node 22.11.x (compatible with the `22.11.0` minimum).

## Final Closeout

- **Prisma CLI classification:** `prisma@6.19.3` is in `devDependencies` for generation and migration tooling. `@prisma/client@6.19.3` remains the runtime dependency; versions remain matched.
- **Production audit:** `npm audit --omit=dev` reported 3 High and 0 Critical advisories through the known Prisma peer/tooling dependency path (`@prisma/config` and `deepmerge-ts`). The advisory is not technically fixed; Prisma CLI is not an application runtime dependency. The risk is accepted for Phase 1 and will be revisited during dependency upgrades. No downgrade and no `npm audit fix --force` were used.
- **Development audit:** `npm audit` reported 3 High and 2 Moderate advisories. The Moderate Vitest advisory is development-only. The known Prisma/deepmerge advisories are also surfaced by npm in the omit-dev view because of peer dependency resolution.
- **Database test command:** `npm run test:db` requires `DATABASE_URL`, uses the Fastify Prisma application boundary, executes `SELECT 1`, and fails immediately when the variable is missing or the database cannot connect. `npm run test:unit` remains database-optional.
- **Unit tests:** passed — `npm run test:unit` completed successfully.
- **Build:** passed with strict TypeScript.
- **PostgreSQL local verification:** passed locally. PostgreSQL 16 was started with Docker Compose, `DATABASE_URL` was configured locally only, and `npm run test:db` passed using the real Prisma/Fastify database boundary. No domain migration was executed because none exists yet.

No newly identified runtime Critical vulnerability exists. The known High audit path is explicitly accepted as a Phase 1 development/thesis risk and is not represented as technically fixed.

**BACKEND PHASE 1 READINESS: READY TO LOCK**

Phase 1 behavior and tooling are complete. The known Prisma/deepmerge audit risk has an explicit Phase 1 acceptance and will be revisited during dependency upgrades. No Phase 2 feature has been introduced.

This is a development/thesis implementation readiness statement, not a production security certification.
