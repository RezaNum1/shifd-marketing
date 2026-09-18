# Backend Phase 10 — Scheduling, Calendar, and Manual Publication

## Objective

Phase 10 adds the canonical scheduling and manual publication persistence
needed after Phase 9 human approval. It keeps publication explicit: a time
passing never posts content and never creates a publication fact.

The implementation does not add social publishing APIs, metric tables, workers,
queues, cron, notifications, or frontend code.

## Migration and tables

The reviewed forward migration is:

`backend/prisma/migrations/20260919100000_phase_10_scheduling_publication/migration.sql`

It creates exactly these Phase 10 tables:

### `content_schedules`

- one stable UUID row per Variant (`UNIQUE variant_id`);
- `scheduled_at`, contract `timezone`, and the server-selected
  `approval_action_id`;
- `created_by`, standard timestamps, and an operational `version`;
- soft cancellation through `cancelled_at` and `cancellation_reason`;
- a partial `scheduled_at` index for non-cancelled actionable rows;
- foreign keys to `platform_variants`, `approval_actions`, and `users`.

Rescheduling updates the existing row and preserves its ID. No public physical
schedule deletion exists.

### `publication_records`

- one canonical publication fact per Variant (`UNIQUE variant_id`);
- one publication per Schedule (`UNIQUE schedule_id`);
- first-publication `scheduled_at_snapshot`;
- `published_at`, optional `post_url`, human `marked_by`, standard timestamps,
  and a correction `version`;
- an index on `published_at`;
- foreign keys to `platform_variants`, `content_schedules`, and `users`.

The migration also adds a PostgreSQL composite foreign key from
`(schedule_id, variant_id)` to `content_schedules(id, variant_id)`. This makes a
cross-Variant publication impossible even though Prisma keeps each ORM
relation scalar-simple. The simple Prisma relation shape avoids repeating the
Phase 9 generated-UUID/composite-relation failure mode.

The existing Content Event check constraint now accepts:

- `schedule_created`
- `schedule_updated`
- `schedule_cancelled`
- `publication_recorded`
- `publication_corrected`

## Endpoints

All mutation endpoints validate the allowed Origin, authenticate the session,
check CSRF, require the parent Content ETag, and authorize through the session
company.

| Method | Endpoint | Semantics |
| --- | --- | --- |
| POST | `/api/contents/:id/schedules` | Atomically create/update the submitted platform schedules. Omitted platforms remain unchanged. |
| PUT | `/api/schedules/:id` | Reschedule one stable schedule row using the parent Content ETag. A cancelled row is reactivated. |
| DELETE | `/api/schedules/:id` | Soft-cancel an unpublished schedule. Repeating the cancellation is a no-op. |
| GET | `/api/calendar` | Read the bounded scheduled-time calendar projection. |
| POST | `/api/schedules/:id/publish` | Record a human manual publication or correct its time/URL using the same PublicationRecord. |

Scheduling accepts only enabled, unarchived, unpublished Variants with a
current valid human approval. The server obtains the current ApprovalAction;
the browser cannot supply an arbitrary approval ID. Times must be future for a
schedule, and timezones are validated as IANA names. The normal artifact
timezone is `Asia/Jakarta`.

Publication accepts a current or past `publishedAt`, allows an early human
publication before `scheduledAt`, and accepts only a null or HTTP(S) `postUrl`.
It does not call a platform API and does not write metrics.

## Schedule and publication lifecycle

Schedule and publication commands are operational writes. Each successful
command increments `Content.version` exactly once. They do not increment
`editorialRevision`, `masterRevision`, or Variant `revision`, so a valid human
approval remains valid across schedule-only operations.

The derived Content lifecycle has this exact precedence:

1. archived Content → `Archived`;
2. every enabled Variant has a PublicationRecord → `Published`;
3. an active schedule exists for an enabled unpublished Variant → `Scheduled`;
4. a current valid human approval exists → `Approved`;
5. the existing editorial-stage mapping.

Thus a published Instagram Variant plus a scheduled unpublished LinkedIn
Variant derives campaign `Scheduled`. `Published` is derived only after every
enabled Variant has a PublicationRecord. There is no persisted Published flag,
Ready to Publish flag, publication counter, or timer transition.

Per-platform schedule display status is a read-time projection:

- PublicationRecord exists → `published`;
- active schedule and `scheduledAt <= asOf` → `ready_to_publish`;
- active future schedule → `scheduled`;
- soft-cancelled schedule → historical `cancelled`.

`GET /api/calendar` captures one injected server `asOf` time and uses it for all
ready-to-publish decisions. It filters the half-open requested period by
`scheduledAt`, excludes archived Content and cancelled schedules, and resolves
Company/Product names live.

## D-02 Request Revision integration

The existing Request Revision transaction now locks Content, Variants, and
Schedules in stable order. On success it:

- preserves all PublicationRecords and published Variants;
- soft-cancels every active schedule without a PublicationRecord;
- records `request_revision` as the stable cancellation reason;
- clears the current approval;
- sets `editorialStage` to `needs_revision`;
- leaves `editorialRevision` unchanged until a real editorial edit;
- appends the existing revision evidence plus schedule-cancellation events.

A fully published Content aggregate cannot request revision. A mixed aggregate
can request revision for its unpublished work while retaining its published
history. No schedule or publication row is deleted.

After publication, review-affecting writes to a published Variant are rejected;
this includes copy and assessment/AI/creative mutation paths. The only
publication correction supported is changing `publishedAt` and/or `postUrl`.
Corrections preserve the original `marked_by` and identify the correction
actor in the `publication_corrected` event.

## Concurrency and idempotency

Schedule/publication transactions lock the parent Content first, then the
required Variant and Schedule rows in stable order. A stale parent ETag returns
`412` before any child write or event.

POST schedule and publication commands use the existing request-idempotency
store. An exact publication retry returns the original PublicationRecord ID
and creates no second event. Database uniqueness plus parent locking prevents
concurrent duplicate publication. A different publication time or URL updates
the same record, increments its version and Content operational version, and
appends one correction event.

## Manual publication limitation

There is no automatic posting, scheduler worker, background job, cron, social
publishing API, Instagram Graph API, LinkedIn API, or metric counter write.
Manual publication is an authenticated human command only. Weekly metrics and
all performance tables remain out of scope.

## Tests and verification

The dedicated real-PostgreSQL suite is:

`npm run test:scheduling`

`backend/tests/scheduling.test.ts` contains 8 passing integration tests covering
the S100–S117, P100–P116, R100–R104, and C100–C113 scenario groups, including
security preconditions, atomic scheduling, stable IDs, soft cancellation,
current approval binding, publication idempotency/concurrency/correction,
Request Revision cancellation, mixed lifecycle, one-`asOf` Calendar
projection, live names, filters, and the physical publication pair FK.

The existing Content fixtures were also made order-independent through small
shared test helpers. The Phase 8 Brand in-flight test now waits for its fake
provider call instead of relying on a fixed 15 ms database timing assumption;
this is test synchronization only and does not change the security or domain
contract.

Verified against the existing Compose PostgreSQL volume with Node 22 Linux
dependencies:

- `npm run db:generate` — PASS
- `npx prisma validate` — PASS
- `npm run db:deploy` — PASS
- `npx prisma migrate status` — PASS; 11 migrations applied and up to date
- `npm run ai:seed` — PASS
- `npm run test:db` — PASS, 1 test
- `npm run test:auth` — PASS, 5 tests
- `npm run test:context` — PASS, 7 tests
- `npm run test:content` — PASS, 7 tests
- `npm run test:assets` — PASS, 9 tests
- `npm run test:ai` — PASS, 8 tests
- `npm run test:adapt` — PASS, 6 tests
- `npm run test:brand` — PASS, 6 tests
- `npm run test:review` — PASS, 4 tests
- `npm run test:scheduling` — PASS, 8 tests
- `npm run test:unit` — PASS, 10 tests; 61 integration tests skipped in unit mode
- `npm run build` — PASS

## Schema drift inspection

`prisma migrate diff --from-url ... --to-schema-datamodel ... --script` was
run non-destructively against the real database. It reports intentional
Prisma/database representation differences, including migration-owned
composite foreign keys, the actionable partial schedule index, and prior
Phase 8 composite same-owner constraints. Prisma also proposes historical
index naming/default normalization that is not applied.

The PostgreSQL catalog was separately checked and confirms the Phase 10
constraints and indexes are present, including:

`publication_records_schedule_variant_fkey`

and

`content_schedules_actionable_scheduled_at_idx`.

This is an intentional ORM/schema representation difference, not unresolved
database drift. No `prisma db push`, reset, applied-migration edit, or FK drop
was performed.

## Known accepted audit advisory

`npm audit --omit=dev` reports exactly three HIGH findings in the Prisma
tooling chain:

1. `deepmerge-ts <8.0.0`, `GHSA-ggr8-5vv4-36mx` (CWE-674 stack exhaustion),
   installed `7.1.5`, via `@prisma/config`;
2. `@prisma/config` versions `6.13.0-dev.1–8.1.0-dev.4`, installed `6.19.3`,
   via `deepmerge-ts`;
3. `prisma` versions `6.13.0-dev.1–8.1.0-dev.4`, installed `6.19.3`, via
   `@prisma/config`.

The suggested fix is a breaking `prisma@6.12.0` change and would be a forced
tooling downgrade. These findings are the previously accepted Prisma/deepmerge
tooling advisory and do not affect runtime production dependencies. No audit
fix or dependency upgrade was performed in Phase 10.

## Readiness

No Phase 10 tag has been created. Phase 11 has not started.
