# Backend Phase 3 — M1 Company and Product Context

Status: implementation report, 2026-09-12.

## Objective

Implement deterministic, authenticated persistence and composition for Company Profile, Brand Profile, nine Business Model Canvas blocks, Products, Product Profiles, live inheritance, Resolved Context, and the fixed content taxonomy. No AI inference, Claude integration, content ideas, content, or frontend API integration is included.

## Scope and files changed

Implemented:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260912170000_phase_3_context/migration.sql`
- `backend/src/modules/context/{constants,normalize,readiness,service,routes}.ts`
- `backend/src/app.ts`
- `backend/src/modules/auth/bootstrap.ts`
- `backend/src/shared/errors/AppError.ts`
- `backend/tests/context.test.ts`
- `backend/tests/auth.test.ts` cleanup for the new restricted context children
- `backend/README.md`

`frontend-v1` was not modified.

## Migration and schema

The migration adds `brand_profiles`, `bmc_blocks`, `products`, `product_profiles`, and `content_pillars`, with UUID identity, PostgreSQL foreign keys, version fields, enum CHECK constraints, and the approved `(company_id, type)` / `(company_id, slug)` uniqueness constraints. It also adds the minimal durable `request_idempotency` table needed to fulfill Product creation replay semantics.

Existing Phase 2 companies receive an empty Brand Profile and missing BMC rows through conflict-safe inserts. The seven content pillars are seeded with stable codes and labels using an idempotent seed statement. No existing Company Profile values are overwritten. The earlier Phase 2 drop/add company normalization migration remains untouched; its documented risk for non-empty databases is a forward-deployment limitation and should be handled with an explicit rename/data-preserving migration before production use.

## Endpoints

- `GET /api/company`
- `PUT /api/company`
- `GET /api/context/resolved`
- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PUT /api/products/:id`
- `GET /api/content-taxonomy`

No Brand/BMC save endpoints, delete endpoint, Ideas endpoint, Content endpoint, or AI endpoint was added.

## Authentication and authorization

All Phase 3 routes reuse the Phase 2 `request.auth` boundary. Company scope is always taken from `request.auth.user.companyId`; browser-supplied company IDs are not accepted. Mutations reuse exact Origin validation and `X-CSRF-Token` verification. Authenticated reads do not require CSRF. Wrong-company Product IDs return `NOT_FOUND`.

## Company aggregate transaction

`PUT /api/company` validates the complete `{ profile, brand, bmcBlocks }` aggregate before opening the write transaction. The transaction locks the Company row, verifies `If-Match` against `contextVersion`, updates Company and Brand, updates all nine BMC rows, increments Company `version` and each relevant child version, and increments `contextVersion` exactly once. Any validation, stale revision, or database failure rolls back the complete aggregate.

`GET /api/company` returns the current profile, Brand, exactly nine fixed-order BMC blocks, reporting timezone, timestamps, and `contextVersion`. Missing bootstrap rows are filled conflict-safely as a defensive read-path repair.

## Product and Product Profile

Product creation is atomic with its initially empty Product Profile. Lists are company-scoped and use status/search filters plus stable `(createdAt DESC, id DESC)` opaque cursors. Slugs are normalized from the product name and use deterministic `-2`, `-3`, etc. suffixes on same-company collisions. Product identity remains the UUID; products are never hard-deleted.

Product updates lock the Product row, require its ETag, update Product and Product Profile in one transaction, increment Product `version` once, and permit incomplete profiles. Campaign objective remains nullable and no claims, features, proof points, or tone wording are invented.

## Dynamic inheritance and Resolved Context

`GET /api/context/resolved` reads current Company, Brand, BMC, Product, and Product Profile rows in one transaction and does not persist a snapshot. When enabled, Product tone inherits the current Company Brand voice. A nonblank override is used only when inheritance is disabled. An empty/disabled override safely falls back to the current Company Brand voice. CTA style and preferred language always come from the current Company Brand. Company edits therefore appear in Product resolved context immediately; inherited values are not duplicated into Product Profile rows.

The deterministic readiness helpers report missing required Company/Product context fields for future M2/M3/M4 operation boundaries. They expose no AI score and call no model.

## Concurrency and idempotency

Company GET/PUT uses `ETag: "<contextVersion>"`; Product GET/POST/PUT uses the Product version ETag where applicable. Company and Product PUT require `If-Match`. Missing preconditions return `428 PRECONDITION_REQUIRED`; stale versions return `412 REVISION_CONFLICT`.

Product creation requires `Idempotency-Key`. The small `request_idempotency` table stores the normalized request hash and original response. A same-company same-operation key/body replays the original 201 response; a different body returns `409 IDEMPOTENCY_CONFLICT`. This is intentionally limited to the Phase 3 Product creation path and is not the later AI request workflow.

## Taxonomy

`GET /api/content-taxonomy` returns exactly seven fixed pillars, six fixed objectives (`awareness`, `education`, `engagement`, `credibility`, `consideration`, `discovery`), and two platforms (`instagram`, `linkedin`). There is no taxonomy editor.

## Tests

`backend/tests/context.test.ts` covers authenticated reads, unauthenticated rejection, Origin/CSRF boundaries, atomic Company save and rejection, duplicate BMC validation, Company revision behavior, Product empty-profile creation, company scoping, atomic Product update, stale Product ETags, dynamic inheritance and override fallback, incomplete readiness, unknown properties, inactive readability, wrong-company 404, taxonomy, and idempotency replay/conflict. Existing authentication cleanup now removes restricted Phase 3 children before test Company deletion.

The suite is designed for real PostgreSQL and does not use SQLite or mocked Prisma coverage. Direct PostgreSQL uniqueness is enforced by the migration and exercised through the database-backed setup.

## Validation results

- `npm run db:generate`: PASS.
- `npx prisma validate`: PASS.
- `npm run db:deploy`: PASS; Phase 3 migration applied locally.
- `npx prisma migrate status`: PASS immediately after deployment; schema reported up to date.
- `npm run test:db`: PASS once; 1 real PostgreSQL test passed.
- `npm run test:auth`: PASS once; 5 database-backed Phase 2 tests passed.
- `npm run test:unit`: PASS; 8 tests passed, database suites skipped without `REQUIRE_DATABASE=1`.
- `npm run build`: PASS with strict TypeScript.
- `npm audit --omit=dev`: 3 HIGH advisories through Prisma CLI tooling (`deepmerge-ts`); the suggested forced fix downgrades Prisma and was not used.

The local database became unreachable before the new `tests/context.test.ts` could complete, so a final Phase 3 integration run could not be recorded in this environment. `npm run db:migrate` was also not allowed to create a new migration: after the concurrent initial command attempt and deployment, it entered Prisma's interactive new-migration prompt. No reset, destructive migration, or rewrite of applied migration history was performed. Use `npm run db:deploy` for the committed migration, then run `npm run db:migrate` in a clean supported Node/PostgreSQL development environment if Prisma proposes a review migration.

## Dependency audit

No runtime dependency was added for Phase 3. The existing Prisma 6.19.3 audit finding remains: three High advisories are reachable through development Prisma tooling. `npm audit fix --force` was not run. No Claude, Anthropic SDK, AI logs, prompts, or credentials were introduced.

## Deferred items and limitations

Ideas, Content, Brief persistence, platform variants, assets, Claude/M2/M3/M4 execution, Brand Assessment, approvals, schedules, publication, performance, external metrics, frontend integration, and later AI idempotency/request lifecycle remain deferred. Taxonomy labels are fixed. Product Profile readiness is available as a pure helper but is not a CRUD gate. The migration inherits the Phase 2 normalization-history limitation documented above.

## Readiness

**BACKEND PHASE 3 READINESS: SUPERSEDED BY STABILIZATION QA BELOW**

Phase 4 is not started and is not marked ready.

# Stabilization and Final QA

QA date: 2026-09-12. This stabilization pass closes the remaining Phase 3 verification gap. Phase 4 was not started, `frontend-v1` was not modified, and no AI capability was introduced.

## GET read-only correction

`readCompanyContext` is now a pure selector. Neither `GET /api/company` nor `GET /api/context/resolved` can create Brand Profile/BMC rows, seed taxonomy, repair data, or increment any Company/Brand/BMC/Product version. The other Phase 3 GET endpoints remain selectors only.

If a Company is unexpectedly missing its Brand Profile or does not have exactly the nine approved BMC types, the selector returns a clear `409 STATE_CONFLICT` explaining that context provisioning is incomplete. It does not repair the database and there is no public repair endpoint.

The real PostgreSQL suite snapshots Company `contextVersion`/`version`, Brand version, BMC IDs/versions, Product/Profile versions, and fixed taxonomy before and after repeated calls to `GET /api/company`, `GET /api/context/resolved` (Company and Product), `GET /api/products`, `GET /api/products/:id`, and `GET /api/content-taxonomy`. The snapshots remain exactly equal.

## Provisioning and migration verification

Provisioning is explicit and repeatable:

- The committed `20260912170000_phase_3_context` migration inserts a blank Brand Profile and all missing approved BMC rows for every pre-existing Company, conflict-safely, without changing Company-entered values.
- `bootstrapOperator` calls the explicit `provisionCompanyContext` helper in the same transaction as Company/User creation.
- Re-running bootstrap for an existing operator calls the same setup helper; database PK/unique constraints retain one Brand Profile and one row per `(company_id, type)`.

The PostgreSQL context suite first verifies every Company already present in the migrated database has one Brand Profile and nine BMC rows, then verifies a just-bootstrapped Company has exactly that state before any `GET /api/company` request. It also confirms PostgreSQL rejects a direct duplicate BMC row with `P2002`.

No corrective migration was needed. `npm run db:deploy` found no pending migrations and `npx prisma migrate status` reported all four committed migrations applied and the schema up to date. The older Phase 2 generated drop/add company-normalization migration remains untouched; its documented forward-safe rename/data-preservation review is still required before any non-empty legacy deployment.

## Idempotency and inheritance verification

The Product creation idempotency boundary remains intentionally limited to Phase 3. Its database uniqueness scope is `(company_id, operation, key)`; the normalized Product request has a deterministic SHA-256 hash. The Product, empty Product Profile, idempotency row, stored response, and ETag commit in one transaction. A same Company/key/normalized request replays the original product without creating another row; a changed body returns `IDEMPOTENCY_CONFLICT`; the same key in another Company creates an independent product.

Resolved Context still stores no snapshot. Product Profile contains only Product-owned fields. Real PostgreSQL tests verify a Product immediately inherits the current Company Brand, a nonblank disabled-inheritance override is selected, a blank override falls back to the current Company Brand, and a later Company Brand change appears in Product resolved context immediately. CTA style and preferred language remain Company-derived.

## Final PostgreSQL QA

The local PostgreSQL 16 Docker service was running and accepting connections. This execution sandbox blocks host TCP access to `127.0.0.1:5432`, so the Node 22 validation process ran in an ephemeral container on the same Docker Compose network using `postgres:5432`; it exercised the actual local PostgreSQL 16 database, not SQLite or a Prisma mock. The workspace was mounted read-only for that process and no QA service remains in the committed Compose file.

- `npm run db:generate`: PASS.
- `npx prisma validate`: PASS.
- `npm run db:deploy`: PASS — no pending migrations.
- `npx prisma migrate status`: PASS — four migrations, schema up to date.
- `npm run test:db`: PASS — 1 real PostgreSQL test.
- `npm run test:auth`: PASS — 5 Phase 2 authentication integration tests.
- `npm run test:context`: PASS — 7 real PostgreSQL Phase 3 integration groups, covering C01–C30 plus explicit provisioning and read-only selector verification.
- `npm run test:unit`: PASS — 8 tests passed; 13 database-dependent tests intentionally skipped without `REQUIRE_DATABASE=1`.
- `npm run build`: PASS — strict TypeScript build.
- `npm audit --omit=dev`: reports the existing 3 High `deepmerge-ts` advisory path through the Prisma CLI tooling. It is not an M1/domain defect; the available remediation downgrades Prisma, so `npm audit fix --force` was not used.

## Scope regression check and remaining limitations

Route, module, Prisma-schema, and frontend-diff inspection confirms no Ideas, Content, Brief persistence, platform variants, creative assets, Claude/Anthropic integration, prompt versions, AI request logs, Brand Assessment, approval, scheduling, publication, performance, external metrics, or frontend API integration exists. The only additional stabilization change is the pure-read/invariant behavior and test command/coverage described above.

The Phase 2 non-empty-environment normalization-migration concern remains a deployment hygiene limitation. The known Prisma tooling dependency advisory remains for dependency-upgrade review. Neither affects the proven Phase 3 M1 domain invariants in this local PostgreSQL validation.

**BACKEND PHASE 3 READINESS: READY TO LOCK**

Phase 4 is not started or implied.
