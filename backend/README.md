# Shifd Marketing Backend

Phase 5 adds the private local Asset boundary and creative reuse to the Phase 4 Ideas and editorial Content foundation. It does not call AI, upload to a cloud provider, integrate Canva, or include Claude or any later assessment, review, scheduling, publication, or performance domain.

## Prerequisites

- Node.js 22 LTS (22.11.0 or newer, below Node 23)
- npm
- PostgreSQL 16 for the approved local integration environment

Docker is used only for the PostgreSQL development service; application processes are not containerized.

## Environment

```sh
nvm use 22.11.0
cp .env.example .env
```

Set `DATABASE_URL` to a PostgreSQL database and keep `ALLOWED_ORIGIN` explicit. `NODE_ENV`, `PORT`, and `HOST` have safe local defaults; startup rejects malformed values. Authentication defaults are configurable with `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `LOGIN_RATE_LIMIT_MAX`, and `LOGIN_RATE_LIMIT_WINDOW_MINUTES`. Never commit `.env`.

Phase 5 asset configuration is validated at startup. `ASSET_STORAGE_ROOT` selects a private persistent local filesystem directory (default `./data/assets`); it is never returned to clients or served statically. The D-05 prototype defaults are `ASSET_MAX_BYTES=10485760`, `ASSET_MAX_WIDTH=8192`, `ASSET_MAX_HEIGHT=8192`, and `ASSET_UNATTACHED_GRACE_HOURS=168`.

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

Phase 4 added only `content_ideas`, `contents`, `content_briefs`, `platform_variants`, and `content_events`; Phase 5 adds only `creative_assets`, `variant_assets`, and the required `platform_variants.reuse_creative_from_variant_id` constraint. Use `npm run db:migrate` locally and `npm run db:deploy` for applying committed migrations in a deployment. `prisma migrate dev`, `prisma migrate deploy`, and `prisma generate` are the supported workflows. Do not use `prisma db push` as the canonical migration command. The case-insensitive email index, Phase 2 company normalization, Phase 3 checks/seed statements, Phase 4 ownership/lifecycle checks, and Phase 5 asset constraints are reviewed PostgreSQL SQL migration additions. Never reset a non-empty database.

For explicit local database verification, run this sequence after PostgreSQL is up and `.env` exists:

```sh
nvm use 22.11.0
docker compose up -d
cp .env.example .env
npm run db:generate
npx prisma validate
npm run db:deploy
npx prisma migrate status
npm run test:db
npm run test:auth
npm run test:context
npm run test:content
npm run test:assets
npm run test:unit
npm run build
```

`npm run test:db` requires `DATABASE_URL` and fails if PostgreSQL is unavailable. `npm run test:auth` and the Phase 3 context suite run against real PostgreSQL. `npm run test:unit` keeps database integration tests optional for isolated HTTP/config tests.

## Scripts

- `npm run dev` — watch-mode server
- `npm run build` — strict TypeScript build
- `npm run start` — run compiled server
- `npm run test` / `npm run test:unit` — Vitest foundation tests without a database requirement
- `npm run test:db` — required real PostgreSQL `SELECT 1` integration test
- `npm run test:auth` — database-backed Phase 2 authentication integration tests
- `npm run test:context` — required database-backed Phase 3 Company/Product Context integration tests
- `npm run test:content` — required database-backed Phase 4 Ideas and Content integration tests
- `npm run test:assets` — required real PostgreSQL plus private-filesystem Phase 5 Asset integration tests
- `npm run assets:cleanup [-- --dry-run]` — operator cleanup of expired unattached Asset files/metadata
- `npm run auth:bootstrap` — restricted operator bootstrap from environment variables
- `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:studio` — Prisma workflows

Public routes are `GET /api/health/live` and the three auth endpoints under `/api/auth`. Phase 3 session routes are `GET/PUT /api/company`, `GET /api/context/resolved`, `GET/POST /api/products`, `GET/PUT /api/products/:id`, and `GET /api/content-taxonomy`. Phase 4 adds the Idea list/create/update/duplicate/archive/restore routes, Content list/create/detail/PATCH routes, Variant copy, progress, duplicate/archive, and event history routes. Unknown routes use the shared error envelope with a request ID. The Prisma plugin creates one client per process and disconnects it during Fastify shutdown.

## Structure

```text
src/app.ts                 Fastify application factory for inject/tests
src/server.ts              configuration, listener, SIGINT/SIGTERM shutdown
src/config/env.ts          runtime configuration validation
src/plugins/prisma.ts      one PrismaClient application boundary
src/modules/auth           password, session, CSRF, bootstrap and auth routes
src/modules/context        Company/Product Context and taxonomy
src/modules/content        Ideas, Content, Briefs, Variants and Events
src/modules/assets         private AssetStorage, upload/read/attach/reuse/delete/cleanup
src/shared/errors          focused application errors
src/shared/http            sanitized error/not-found handlers
src/modules/health         liveness route
prisma/schema.prisma       PostgreSQL companies/users/session models
tests/                     HTTP/config/database/authentication/context/content tests
tests/assets.test.ts       PostgreSQL and temporary-private-filesystem Asset tests
```

## Scope and limitations

Authentication uses an opaque random token in an HttpOnly `shifd_session` cookie; only its SHA-256 hash is stored. Cookies are `SameSite=Lax`, `Path=/`, and Secure in production. Login and logout require the configured Origin; authenticated mutations require `X-CSRF-Token`, while `/api/auth/me` rotates and returns a fresh CSRF token. Sessions enforce idle and absolute expiry and inactive users cannot authenticate. The API does not expose passwords, hashes, tokens, secrets, readiness diagnostics, or database details.

## Phase 3 context behavior

`GET /api/company` returns the complete Company Profile, Brand Profile, exactly nine ordered BMC blocks, `Asia/Jakarta`, and `contextVersion`. `PUT /api/company` accepts `{ profile, brand, bmcBlocks }` only and saves all three parts in one PostgreSQL transaction. It requires `If-Match: "<contextVersion>"`; successful saves increment `contextVersion` exactly once and return the new ETag. Missing and stale preconditions use `428 PRECONDITION_REQUIRED` and `412 REVISION_CONFLICT`.

Products have company-scoped unique slugs, UUID identities, `active`/`inactive`/`draft` status, and one initially empty Product Profile. Product updates save the identity and profile atomically and require the Product ETag. Products are never hard-deleted. Creation requires `Idempotency-Key`; the durable request boundary replays the original response for the same company/path/body and returns `409 IDEMPOTENCY_CONFLICT` for a different body.

`GET /api/context/resolved` composes current Company, Brand, BMC, Product, and Product Profile data without storing a snapshot. Brand voice follows current Company Brand unless a nonblank Product override is enabled; CTA style and preferred language always come from Company Brand. `GET /api/content-taxonomy` returns the seven fixed pillars, six fixed objectives, and Instagram/LinkedIn platforms. A deterministic product readiness helper exists for future AI operation boundaries but no score or model call is exposed.

Phase 3 bootstrap creates an empty Brand Profile and all nine BMC rows for new companies. The migration does the same for existing Phase 2 companies using conflict-safe inserts and seeds fixed pillars idempotently. It does not overwrite company fields or invent brand guidance, claims, proof points, or objectives.

## Phase 4 editorial persistence

Ideas follow `ready → used` with a non-destructive archived branch. Ready Ideas can be edited; Used and Archived Ideas cannot. Duplicate, archive, and restore commands preserve historical `relatedContentIds`, which are derived from `contents.sourceIdeaId` rather than stored on the Idea. New Idea and Brief selections reject inactive Products.

`POST /api/contents` is the meaningful saved-work boundary. It validates a complete Brief, then creates one Content root, its owned Brief, enabled platform Variant rows, and a `brief_created` event in one PostgreSQL transaction. When a Ready Idea is supplied, the same transaction marks it Used. A failed transaction leaves the Idea Ready and creates no partial records. Saving a Content does not call AI.

Content stores the canonical Brief, optional validated Master and Visual Direction JSON, editorial stage, design status, and revisions. Lifecycle status and resume step are derived from `archivedAt` and `editorialStage`; neither is writable or persisted. The Content title is derived from `master.title`, falling back to `brief.topic`. Variant adaptation state is derived from complete copy, the current Master revision, and `adaptedFromMasterRevision`. Disabled Variants remain stored.

Brief context and Product ownership live on Content. Product and Company names resolve live, so renames are visible without snapshots. Content child writes lock the parent and require its `If-Match` ETag. Content `version` increments for every successful aggregate/child command; `editorialRevision` increments for editorial input only; `masterRevision` changes only when Master changes; and only the changed Variant copy increments its Variant revision. Progress and archive commands do not increment `editorialRevision`.

Idea creation/duplication and Content creation/duplication require `Idempotency-Key`. The bounded Phase 3 `request_idempotency` table scopes keys by authenticated Company and operation, hashes normalized request data including duplicate preconditions, and stores the original response only after the domain transaction commits. Same-key retries replay the original resource; a different request returns `IDEMPOTENCY_CONFLICT`. This is command replay, not an AI request lifecycle.

Content Events are append-only audit records for accepted user commands: `brief_created`, `content_updated`, `variant_updated`, `progress_changed`, `content_duplicated`, and `content_archived`. They never determine current state and carry concise metadata only. Content duplication creates new Content/Brief/Variant IDs, stays Draft, copies available editorial data and `sourceIdeaId` provenance, and does not consume the source Idea. Archive is soft and preserves Briefs, Variants, Events, and Idea links.

## Phase 5 Assets and creative reuse

`POST /api/assets` accepts a multipart `file` and `purpose` (`creative` or `metric_evidence`) with an authenticated session, valid Origin, CSRF token, and `Idempotency-Key`. The server streams to a private temporary file, enforces the configured byte limit, verifies actual PNG/JPEG bytes with Sharp, extracts dimensions, hashes the bytes, and stores immutable metadata beside a server-generated UUID storage key. Browser MIME types, extensions, filenames, paths, and URLs are never used as storage identity. Supported uploads are PNG and JPEG only; the API returns the approved Asset projection and an authenticated `/api/assets/:id/content` URL. Content reads use private/no-store responses and never expose filesystem paths, storage keys, or checksums. Canva remains an external manual tool; no Canva integration or AI image generation exists.

Content exposes ordered `ownAssets` and derived `effectiveAssets` for each Variant. `PUT /api/contents/:id/variants/:platform/assets` atomically replaces ordered own attachment links, accepts only ready `creative` Assets from the authenticated Company, and preserves detached Asset rows. `PUT /api/contents/:id/variants/linkedin/creative-reuse` can point LinkedIn at the same Content's Instagram Variant. Reuse changes effective LinkedIn Assets without deleting LinkedIn own attachments; turning it off restores them. Metric-evidence Assets are stored for later Performance work but cannot attach to Variants.

Asset attachment and reuse commands use the parent Content ETag/`If-Match`, increment Content `version` and `editorialRevision` once for a real change, leave Master and Variant copy revisions unchanged, regress non-Draft editorial progress to Draft using the Phase 4 rule, and append a concise `content_updated` event. Uploading an unattached Asset does not change Content. Content duplication creates fresh Content/Brief/Variant IDs, reuses immutable Asset IDs and ordering, and remaps LinkedIn reuse to the duplicated Instagram Variant; it does not copy file bytes or consume a source Idea.

`GET /api/assets/:id` and the authenticated content endpoint are Company scoped. `DELETE /api/assets/:id` is allowed only for unreferenced Assets, marks pending deletion before removing private bytes, and does not detach anything automatically. Failed physical deletion remains retryable as `pending_delete` and is not reported as successful. `npm run assets:cleanup` is the bounded operator maintenance command; it lock/rechecks references, respects the seven-day grace period, supports `--dry-run`, and removes only expired unattached Assets. It also cleans stale temporary upload files and expired UUID-named final files left by a process crash before database commit, after comparing them with all known metadata keys. Local storage is persistent only while `ASSET_STORAGE_ROOT` is preserved; deployments should mount that directory as a private volume.

Phase 5 completes the approved D-03 compatibility gate without inventing Human Review: when `designStatus` is not `ready`, asset absence does not block `ready_for_review`; when it is `ready`, each enabled Variant needs at least one effective creative Asset, and reuse counts. Master and current enabled Variant adaptations remain required. Approval, assessment, and asset-specific future workflow remain deferred.

## Operator bootstrap

Set `BOOTSTRAP_COMPANY_NAME`, `BOOTSTRAP_COMPANY_DESCRIPTION`, `BOOTSTRAP_USER_NAME`, `BOOTSTRAP_USER_EMAIL`, and `BOOTSTRAP_USER_PASSWORD` only in the local environment, then run `npm run auth:bootstrap`. The command creates one founder user with an Argon2id password hash and refuses duplicate email creation. It never logs or stores the plaintext password. No HTTP bootstrap or public signup endpoint exists.
