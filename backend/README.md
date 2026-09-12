# Shifd Marketing Backend

Phase 1 establishes the backend foundation only. It does not implement authentication, users, Company/Product Context, Ideas, Content, assets, Claude, approval, scheduling, publication, performance, or social APIs.

## Prerequisites

- Node.js 22 LTS (22.11.0 or newer, below Node 23)
- npm
- PostgreSQL 14+ for database work

Docker is used only for the PostgreSQL development service; application processes are not containerized.

## Environment

```sh
nvm use 22.11.0
cp .env.example .env
```

Set `DATABASE_URL` to a PostgreSQL database and keep `ALLOWED_ORIGIN` explicit. `NODE_ENV`, `PORT`, and `HOST` have safe local defaults; startup rejects malformed values. No Anthropic key, model ID, upload limit, session duration, or AI limit is configured in Phase 1.

## Local PostgreSQL

Start the PostgreSQL-only development service with Docker Compose:

```sh
docker compose up -d
```

Stop it with `docker compose down`; reset it only for local development with `docker compose down -v` followed by `docker compose up -d`. Never use the documented credentials outside local development.

## Install, database, and run

```sh
npm install
npm run db:generate
npm run dev
```

There are intentionally no domain migrations in Phase 1. Use `npm run db:migrate` when the first domain migration is introduced, and `npm run db:deploy` for applying committed migrations in a deployment. `prisma migrate dev`, `prisma migrate deploy`, and `prisma generate` are the supported workflows. Do not use `prisma db push` as the canonical migration command. Later PostgreSQL-specific partial indexes, exclusion constraints, deferrable constraints, and similar guarantees may be added as reviewed SQL migration steps when Prisma cannot express them cleanly.

For explicit local database verification, run this sequence after PostgreSQL is up and `.env` exists:

```sh
nvm use 22.11.0
docker compose up -d
cp .env.example .env
npm run db:generate
npx prisma validate
npm run test:db
npm run test:unit
npm run build
```

`npm run test:db` requires `DATABASE_URL` and fails if PostgreSQL is unavailable. `npm run test:unit` keeps the database check optional for isolated HTTP/config tests.

## Scripts

- `npm run dev` — watch-mode server
- `npm run build` — strict TypeScript build
- `npm run start` — run compiled server
- `npm run test` / `npm run test:unit` — Vitest foundation tests without a database requirement
- `npm run test:db` — required real PostgreSQL `SELECT 1` integration test
- `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:studio` — Prisma workflows

The only public route is `GET /api/health/live`, returning `{ "status": "ok" }`. Unknown routes use the shared error envelope with a request ID. The Prisma plugin creates one client per process and disconnects it during Fastify shutdown.

## Structure

```text
src/app.ts                 Fastify application factory for inject/tests
src/server.ts              configuration, listener, SIGINT/SIGTERM shutdown
src/config/env.ts          runtime configuration validation
src/plugins/prisma.ts      one PrismaClient application boundary
src/shared/errors          focused application errors
src/shared/http            sanitized error/not-found handlers
src/modules/health         liveness route
prisma/schema.prisma       PostgreSQL generator/datasource (no domain models yet)
tests/                     HTTP/config/database foundation tests
```

## Scope and limitations

This server has no auth or authorization, so `/api/health/live` is intentionally public. It does not expose readiness/database diagnostics, secrets, environment values, process versions, or database details. CORS allows only the validated `ALLOWED_ORIGIN` for local development and enables credentials for future HttpOnly sessions; CSRF/authentication remain deferred. PostgreSQL integration tests run only when `DATABASE_URL` points at an available database; otherwise the test is skipped and must not be read as database connectivity evidence.
