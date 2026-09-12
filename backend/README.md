# Shifd Marketing Backend

Phase 2 adds internal authentication to the Phase 1 foundation. It implements only companies, users, opaque sessions, login/logout/me, CSRF and login throttling. Company Context and all marketing domains remain deferred.

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

Set `DATABASE_URL` to a PostgreSQL database and keep `ALLOWED_ORIGIN` explicit. `NODE_ENV`, `PORT`, and `HOST` have safe local defaults; startup rejects malformed values. Authentication defaults are configurable with `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `LOGIN_RATE_LIMIT_MAX`, and `LOGIN_RATE_LIMIT_WINDOW_MINUTES`. Never commit `.env`.

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

Phase 2 includes the first domain migration for `companies`, `users`, and `auth_sessions`. Use `npm run db:migrate` locally and `npm run db:deploy` for applying committed migrations in a deployment. `prisma migrate dev`, `prisma migrate deploy`, and `prisma generate` are the supported workflows. Do not use `prisma db push` as the canonical migration command. The case-insensitive email index is a reviewed PostgreSQL SQL migration addition.

For explicit local database verification, run this sequence after PostgreSQL is up and `.env` exists:

```sh
nvm use 22.11.0
docker compose up -d
cp .env.example .env
npm run db:generate
npx prisma validate
npm run db:migrate
npm run test:db
npm run test:auth
npm run test:unit
npm run build
```

`npm run test:db` requires `DATABASE_URL` and fails if PostgreSQL is unavailable. `npm run test:auth` runs the real database-backed authentication suite. `npm run test:unit` keeps database integration tests optional for isolated HTTP/config tests.

## Scripts

- `npm run dev` — watch-mode server
- `npm run build` — strict TypeScript build
- `npm run start` — run compiled server
- `npm run test` / `npm run test:unit` — Vitest foundation tests without a database requirement
- `npm run test:db` — required real PostgreSQL `SELECT 1` integration test
- `npm run test:auth` — database-backed Phase 2 authentication integration tests
- `npm run auth:bootstrap` — restricted operator bootstrap from environment variables
- `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:studio` — Prisma workflows

Public routes are `GET /api/health/live` and the three auth endpoints under `/api/auth`. Unknown routes use the shared error envelope with a request ID. The Prisma plugin creates one client per process and disconnects it during Fastify shutdown.

## Structure

```text
src/app.ts                 Fastify application factory for inject/tests
src/server.ts              configuration, listener, SIGINT/SIGTERM shutdown
src/config/env.ts          runtime configuration validation
src/plugins/prisma.ts      one PrismaClient application boundary
src/modules/auth           password, session, CSRF, bootstrap and auth routes
src/shared/errors          focused application errors
src/shared/http            sanitized error/not-found handlers
src/modules/health         liveness route
prisma/schema.prisma       PostgreSQL companies/users/session models
tests/                     HTTP/config/database/authentication tests
```

## Scope and limitations

Authentication uses an opaque random token in an HttpOnly `shifd_session` cookie; only its SHA-256 hash is stored. Cookies are `SameSite=Lax`, `Path=/`, and Secure in production. Login and logout require the configured Origin; authenticated mutations require `X-CSRF-Token`, while `/api/auth/me` rotates and returns a fresh CSRF token. Sessions enforce idle and absolute expiry and inactive users cannot authenticate. The API does not expose passwords, hashes, tokens, secrets, readiness diagnostics, or database details. PostgreSQL integration tests run against the configured database; `npm run test:unit` skips them unless explicitly requested.

## Operator bootstrap

Set `BOOTSTRAP_COMPANY_NAME`, `BOOTSTRAP_COMPANY_DESCRIPTION`, `BOOTSTRAP_USER_NAME`, `BOOTSTRAP_USER_EMAIL`, and `BOOTSTRAP_USER_PASSWORD` only in the local environment, then run `npm run auth:bootstrap`. The command creates one founder user with an Argon2id password hash and refuses duplicate email creation. It never logs or stores the plaintext password. No HTTP bootstrap or public signup endpoint exists.
