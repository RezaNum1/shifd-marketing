# Backend Phase 4 — Ideas and Content Persistence

Status: implementation report, 2026-09-13.

## Objective

Implement persistent Content Ideas, saved Content, structured Briefs, platform
Variants, editorial revisions, deterministic lifecycle/resume projections,
append-only Content Events, and duplicate/archive behavior. No AI generation,
Claude, file upload, approval, scheduling, publication, performance, or
frontend-v1 change is included.

## Implemented scope and files

The implementation adds:

- `backend/prisma/migrations/20260913100000_phase_4_content_persistence/migration.sql`
- Phase 4 Prisma models in `backend/prisma/schema.prisma`.
- `backend/src/modules/content/{constants,lifecycle,idempotency,service,routes}.ts`.
- `backend/tests/content.test.ts` and the `test:content` package script.
- Phase 4 sections in `backend/README.md`.

The temporary Compose QA helper used to reach PostgreSQL from the sandbox was
removed from `backend/docker-compose.yml`. The committed development service
remains PostgreSQL only.

## Migration and tables

The forward-only migration creates exactly `content_ideas`, `contents`,
`content_briefs`, `platform_variants`, and `content_events`. It adds allowed
value checks, positive revision checks, unique `(content_id, platform)`, and
composite Company/Product and Company/source-Idea foreign keys. Deletion is
restrictive; no future-domain placeholder tables were created. Previously
applied Phase 1–3 migrations were not edited.

The Phase 2 company normalization migration retains its documented generated
drop/add risk for non-empty legacy deployments. It was not rewritten during
Phase 4.

## Endpoints and authentication

All endpoints are authenticated and Company-scoped through `request.auth`.
Mutations reuse the Phase 2 Origin and CSRF boundary. Wrong-company IDs return
`NOT_FOUND`, and unknown writable properties are rejected.

Ideas:

- `GET/POST /api/content-ideas`
- `PUT /api/content-ideas/:id`
- `POST /api/content-ideas/:id/duplicate`
- `POST /api/content-ideas/:id/archive`
- `POST /api/content-ideas/:id/restore`

Content:

- `GET/POST /api/contents`
- `GET/PATCH /api/contents/:id`
- `PUT /api/contents/:id/variants/:platform`
- `POST /api/contents/:id/progress`
- `POST /api/contents/:id/duplicate`
- `POST /api/contents/:id/archive`
- `GET /api/contents/:id/events`

No DELETE endpoint, AI endpoint, asset endpoint, review-actions endpoint,
schedule/publication endpoint, or frontend API integration was added.

## Idea lifecycle and source acceptance

Ideas start `ready`; only Ready Ideas can be edited. Ready or Used Ideas can be
soft-archived; Archived restores to Ready. Duplication creates a fresh Ready
row with a `(Copy)` title and no content links. `relatedContentIds` is derived
from `contents.sourceIdeaId`, never stored. New Idea/Product selection rejects
inactive Products while historical links remain readable.

`POST /api/contents` validates the complete Brief, same-company active Product,
active pillar, and at least one unique enabled platform, then transactionally
creates Content, Brief, enabled Variant rows, the `brief_created` event, and—if
supplied—the Ready → Used source-Idea transition. The source Idea is locked and
re-checked, so concurrent consumers produce one success and one
`STATE_CONFLICT`. Any failure rolls back every write and leaves the Idea Ready.
Content creation starts as Draft with no generated Master or copy. Saving
Content does not call AI.

## Brief, Content, and Variant persistence

Content owns `contextType` and `productId`; Brief owns pillar, objective,
audience, topic, angle, and instructions. Product and Company names are live
read projections, not snapshots. Each platform has one persisted Variant;
disabling sets `enabled=false` and never deletes. Manual Variant copy requires
an enabled target, current parent ETag, unarchived Content, and a complete
Master. Only the target Variant is changed.

Content duplication accepts active or archived source Content. It creates new
Content/Brief/Variant IDs, copies Brief/Master/Visual Direction/copy/enabled
states, preserves `sourceIdeaId` as provenance without consuming the Idea, and
resets the new lifecycle to Draft, `archivedAt=null`, and `version=1`. Archive
is soft and preserves all child rows, Events, and Idea references.

## Lifecycle, revisions, and readiness

Lifecycle and resume are pure selectors. `archivedAt` maps to Archived;
otherwise editorial stages map to Draft, Generated, Adapted, Creative In
Progress, Ready for Review, or Needs Revision. Resume maps to
`brief|generate|adapt|creative|review`, or null for Archived. Title resolves
`master.title`, then `brief.topic`.

Variant adaptation is derived: `missing` without complete copy or Master,
`current` when copy is complete and `adaptedFromMasterRevision` matches, and
`needs_adaptation` after a Master revision change. No lifecycle, resume,
adaptation, UI-step, or resolved-snapshot table exists.

Content and Idea ETags use their version. Content child mutations lock the
parent and require its `If-Match`; missing and stale values return 428 and 412.
Content `version` increments once for every successful aggregate/child command.
`editorialRevision` increments once for Brief, Master, Visual Direction,
platform-set, design-status, or Variant-copy changes. Progress and archive do
not increment it. `masterRevision` changes only when Master changes, and only
the edited Variant revision changes for Variant copy.

## Idempotency and Events

Idea creation/duplication and Content creation/duplication require
`Idempotency-Key`. The bounded Phase 3 `request_idempotency` table is reused;
operation scope includes Company and source operation, and normalized body plus
duplicate preconditions are hashed. Domain writes and successful response are
transactional. Same-key retries replay the original resource, different input
returns `IDEMPOTENCY_CONFLICT`, and duplicate replay is checked before a stale
source ETag. No AI request lifecycle was introduced.

Actual user commands append `brief_created`, `content_updated`,
`variant_updated`, `progress_changed`, `content_duplicated`, and
`content_archived` Events. Metadata is concise and excludes passwords,
cookies/session tokens, CSRF tokens, binary data, and credentials. Events are
append-only audit history and never determine current state. Event pagination
uses descending `(createdAt,id)` cursors.

## Tests and PostgreSQL result

`backend/tests/content.test.ts` has seven real database integration groups for
Idea lifecycle/filtering/idempotency, Product context and inactive Products,
atomic Content/Idea consumption, source-Idea concurrency, company isolation,
live names/title/adaptation, ETags/revisions/progress, events, duplication,
archive, CSRF/Origin, and side-effect-free reads. Pure selectors are also
tested. `npm run test:content` requires `DATABASE_URL` and
`REQUIRE_DATABASE=1`; it never silently skips and uses no SQLite or mocked
Prisma.

The local PostgreSQL 16 Docker service was used. Because host TCP forwarding is
blocked in this sandbox, the same Node 22 test commands ran on the Compose
network against `postgres:5432`, the actual local PostgreSQL database.

- `npm run db:generate`: PASS — Prisma Client 6.19.3.
- `npx prisma validate`: PASS.
- `npm run db:deploy`: PASS — five migrations, no pending migrations.
- `npx prisma migrate status`: PASS — schema up to date.
- `npm run test:db`: PASS — 1 test.
- `npm run test:auth`: PASS — 5 Phase 2 tests.
- `npm run test:context`: PASS — 7 Phase 3 tests.
- `npm run test:content`: PASS — 7 Phase 4 integration groups.
- `npm run test:unit`: PASS — 8 foundation tests.
- `npm run build`: PASS — strict TypeScript.
- `npm audit --omit=dev`: 3 High advisories in the existing `deepmerge-ts`
  path through Prisma tooling. The available forced fix downgrades Prisma;
  it was not used, and `npm audit fix --force` was not run.

## Regression, deferred items, and limitations

No Phase 5+ tables/routes or frontend API integration exist. File upload,
creative assets, Canva, Claude, M2 Generate, M3 Adapt, M4 Brand Check, prompt
versions, AI request logs, Brand Assessment, Human Review/approval/override,
scheduling/calendar, publication, performance/metrics, and social APIs remain
deferred. `ready_for_review` validates available editorial prerequisites only;
the strict asset-dependent D-03 gate remains deferred until the asset/review
phase. The Phase 2 normalization-migration review and known Prisma tooling
advisory remain deployment limitations.

**BACKEND PHASE 4 READINESS: READY FOR REVIEW**

Phase 5 was not started or marked ready.

# Final QA

## Coverage matrix

The matrix below distinguishes assertions made by the real integration suite
from source-level verification. A broad test group is not counted as proof of
an invariant unless the invariant is asserted directly.

| ID | Result | Evidence |
|---|---|---|
| I01 | PASS — automated | `content.test.ts` creates a Ready Idea and checks its ETag. |
| I02 | PASS — automated | Product-context Idea accepts the same-company active Product and rejects inactive selection. |
| I03 | PASS — automated | Company-context Idea with `productId` is rejected. |
| I04 | PARTIAL | Company-scoped search/filter behavior is asserted; full Idea cursor traversal and every filter combination are not independently asserted. |
| I05 | PASS — automated | Ready Idea update with matching If-Match succeeds. |
| I06 | PASS — automated | Stale Idea If-Match returns 412. |
| I07 | PASS — automated | Used and Archived Ideas reject editing. |
| I08 | PASS — automated | Idea duplication creates an independent Ready copy. |
| I09 | PASS — automated | Ready Idea archive is asserted. |
| I10 | PASS — source verified only | Archive is a status/version update and preserves restrictive Content references; direct Used→Archived preservation is covered through the linked source flow. |
| I11 | PASS — automated | Archived linked Idea restores to Ready with its historical `relatedContentIds`. |
| I12 | PASS — automated | Same-key Idea replay returns the original and changed body conflicts. |
| C01 | PASS — automated | Content creation asserts Content, Brief, and both enabled Variant rows. |
| C02 | PASS — automated | Successful source-Idea Content creation asserts Ready→Used. |
| C03 | PASS — automated | Invalid creation asserts zero Content rows and source Idea remains Ready. |
| C04 | PASS — automated | A Used source Idea cannot be consumed by normal creation. |
| C05 | PASS — automated | Concurrent source consumption yields exactly one Content and one 409. |
| C06 | PASS — automated | Content creation idempotency replay returns the original Content. |
| C07 | PARTIAL | Same-company Product validation is automated; a dedicated wrong-company Product in Brief assertion is not. |
| C08 | PASS — automated | Inactive Product cannot be selected for new Content. |
| C09 | PASS — automated | Content remains readable after its Product is made inactive. |
| C10 | PASS — automated | Other-company Content detail and list are both asserted as inaccessible/empty. |
| C11 | PARTIAL | Search, platform/pillar/product filters, and lifecycle cursor behavior are covered; all filter combinations are not separately asserted. |
| C12 | PASS — automated | New Content falls back to Brief topic; Master title is asserted after Master creation. |
| C13 | PASS — source verified only | DTO mapping selects live Company/Product names and stores no name snapshots. |
| C14 | PASS — automated | Repeated Content reads are compared against database state. |
| C15 | PASS — automated | Content PATCH requires parent If-Match. |
| C16 | PASS — automated | Stale Content If-Match returns 412. |
| C17 | PASS — automated | Aggregate PATCH returns one parent version increment. |
| C18 | PASS — automated | Aggregate editorial update increments `editorialRevision` once. |
| C19 | PASS — automated | Master revision changes, old copy remains, adaptation becomes `needs_adaptation`, and stage regresses to Draft. |
| C20 | PASS — automated | Variant update targets only the selected platform. |
| C21 | PASS — automated | Variant revision and parent editorial revision behavior is asserted. |
| C22 | PASS — automated | Pure adaptation selector covers missing/current/stale states. |
| C23 | PASS — automated | Platform removal disables the existing row and expansion creates/enables the missing row. |
| C24 | PASS — automated | Empty enabled-platform set is rejected. |
| C25 | PASS — automated | Adapted progress rejects stale/missing adaptation. |
| C26 | PASS — automated | Valid progress writes stage/event without editorial revision increment. |
| C27 | PASS — automated | Manual `generated` progress is rejected. |
| C28 | PASS — automated | Duplicate has a new ID and Draft lifecycle. |
| C29 | PASS — automated | Duplicate preserves sourceIdeaId without changing source Idea status. |
| C30 | PASS — automated | Duplicate replay returns the same duplicate. |
| C31 | PASS — automated | Archive is soft and detail still contains Brief, Variants, and archive Event. |
| C32 | PASS — source verified only | Lifecycle is derived by `deriveLifecycleStatus`; no persisted lifecycle field exists. |
| C33 | PASS — source verified only | Resume is derived by `deriveResumeStep`; no persisted resume field exists. |
| C34 | PARTIAL | Wrong-company Content is automated; a separate wrong-company Idea endpoint assertion is not. |
| C35 | PASS — automated | Mutation Origin and CSRF failures are asserted. |
| C36 | PASS — automated | Authenticated GETs execute without CSRF. |
| C37 | PARTIAL | Actual event types and append-only application behavior are covered; no direct database trigger/API tamper test exists. |
| C38 | PASS — automated | Event response is checked not to contain the CSRF secret; source review excludes auth secrets from metadata. |
| C39 | PASS — automated | Event pagination uses and tests a stable cursor. |
| C40 | PASS — automated | Repeated Idea/Content/detail/Event reads are compared against persistence state. |

The PARTIAL items are coverage limitations, not identified domain failures.

## Idea atomicity review

Idea selection and all Idea GET paths are read-only. Only successful Content
creation locks and re-checks a Ready source Idea, then creates Content, Brief,
Variants, the `brief_created` Event, and the Ready→Used update in the same
PostgreSQL transaction. Invalid Brief/Product/Pillar input and transaction
errors occur before commit and leave no partial Content or status change.
The row lock prevents two concurrent first consumers. Content duplication
retains `sourceIdeaId` as provenance and never consumes the Idea. There is no
writable or persisted `relatedContentIds` field; it is derived from
`contents.source_idea_id`. Restoring an Idea does not alter historical Content
links.

## Editorial-stage regression review

This QA found and corrected a real coherence defect: changing Master, Brief,
Visual Direction, enabled platform set, design status, or actual Variant copy
could previously leave a later editorial stage in place after its prerequisites
became invalid. Those actual editorial changes now regress any non-Draft stage
to Draft. Existing copy and historical `adaptedFromMasterRevision` values are
untouched, so adaptation is derived as `needs_adaptation` when appropriate.
Adding an enabled platform with no current copy likewise cannot leave the
Content claiming Adapted-or-later. Progress remains explicit and never auto-
promotes a Content merely because prerequisites later become true. A same-value
aggregate PATCH is intentionally treated as a successful editorial write: it
increments parent `version` and `editorialRevision` once, does not increment
`masterRevision`, and does not regress the stage.

## D-03 / Ready for Review

The locked frontend-v1 `canContinueToReview` behavior is conditional: it allows
continuation when design is not `ready`, or when every required creative asset
is available/reused. Phase 4 has no Asset domain, so the backend does not add a
global asset requirement and does not fabricate asset evidence. Its
`ready_for_review` command verifies the available editorial gate: Master exists
and every enabled Variant has complete current copy. The asset-dependent part
of D-03 remains explicitly deferred to the Asset/Human Review phase.

## Lifecycle filtering and pagination

`lifecycleStatus` is converted to a PostgreSQL `WHERE` predicate on
`archivedAt`/`editorialStage` before the stable `(updatedAt DESC, id DESC)`
cursor and limit are applied. The new regression traverses Draft pages with
interleaved Generated rows and verifies no matching Draft is omitted; it also
checks the Generated predicate directly. No arbitrary unfiltered page is
derived and filtered in memory.

## Duplicate revision coherence

Content duplication creates fresh Content, Brief, Variant, and Event IDs;
source Content is unchanged; source Idea provenance is retained without
re-consumption. The duplicate always starts with Draft, `version=1`, and no
archive timestamp. Copied Master yields a valid positive `masterRevision`,
copied Variants start at fresh `revision=1`, and their historical adaptation
revision is retained only when a Master exists. Adaptation state is therefore
derived honestly from the copied data and revision relationship. No approval,
schedule, publication, or Asset state is copied because those domains do not
exist in Phase 4.

## Version, revision, and idempotency review

Every successful Content aggregate/child command increments parent `version`
once. Editorial input changes increment `editorialRevision` once per command;
progress and archive do not. Master revision increments only for an actual
Master value change. Variant revision increments only on the target Variant
write. Same-value PATCH behavior is intentional as documented above. Same-value
Variant copy writes also intentionally refresh the target adaptation reference
and increment only that Variant plus the parent once. Parent locking and
If-Match checks prevent silent last-write-wins behavior.

The Phase 3 `request_idempotency` boundary is reused without introducing an AI
request lifecycle. Scope is Company + operation/resource + key, and the
authenticated actor is included in the deterministic normalized request hash.
The hash also includes normalized body data and duplicate preconditions. The
idempotency record, domain resource, child rows, Idea consumption, and Events
commit in one transaction. Lookup occurs before duplicate source ETag
validation, so a retry can replay after the source has changed. Different
payloads, actors, or preconditions conflict, and Company scope prevents
cross-company replay. Operations are distinct for Idea creation/duplication
and Content creation/duplication.

## Event review

Application commands append only the actual Phase 4 event types:
`brief_created`, `content_updated`, `variant_updated`, `progress_changed`,
`content_duplicated`, and `content_archived`. Events contain authenticated user
actor data, request IDs, concise metadata, and no password, cookie, session,
CSRF, credential, or binary fields. Events do not drive current state. Event
reads are Company-scoped and paginate by descending `(createdAt,id)`. Idempotent
duplicate/archive retries do not append another semantic event.

## PostgreSQL constraints and migration status

No stabilization schema change was needed. The committed forward-only Phase 4
migration remains `20260913100000_phase_4_content_persistence`; no earlier SQL
was edited and no reset was used. PostgreSQL checks cover context/product
compatibility, approved lifecycle/design/platform/objective values, positive
revision values, and event actor/event types. Composite foreign keys enforce
Company/Product, Company/source-Idea, and Content/Variant compatibility.
Unique `(content_id, platform)` prevents duplicate Variants. The database
contains only the five Phase 4 tables in addition to Phases 1–3; no Phase 5
tables were added.

Migration verification completed successfully:

- `npm run db:generate`: PASS.
- `npx prisma validate`: PASS.
- `npm run db:deploy`: PASS; no pending migrations.
- `npx prisma migrate status`: PASS; schema up to date.

## Regression and build results

The corrected Phase 4 integration suite was rerun against the real local
PostgreSQL 16 environment and passed. The previously observed C28–C36/C40
failure was a stale test expectation: the shared Content had legitimately been
edited earlier, so its current Brief topic was `Live title fallback`. Production
archive behavior was already correct. The test now captures the current state
immediately before archive and verifies that archive preserves the current
Brief, Variant identities/content, authored Master and Visual Direction,
sourceIdeaId, and editorialRevision while setting the archive state and adding
the archive Event. No production rollback or content mutation was introduced
to satisfy the obsolete expectation.

- `npm run test:db`: PASS — 1 test.
- `npm run test:auth`: PASS — 5 tests.
- `npm run test:context`: PASS — 7 Phase 3 tests.
- `npm run test:content`: PASS — 7 Phase 4 tests after the C31 assertion
  correction; `REQUIRE_DATABASE=1` remained enforced.
- `npm run test:unit`: PASS — 8 tests; database suites correctly skipped in
  the non-database unit invocation.
- `npm run build`: PASS — strict TypeScript compilation.
- `git diff --check`: PASS.

`npm audit --omit=dev` reports the existing 3 High `deepmerge-ts` advisories
through Prisma tooling. The suggested forced remediation downgrades Prisma;
`npm audit fix --force` was not run.

## Scope regression and remaining limitations

Source/schema scans found no creative assets, variant assets, file storage or
upload, Canva, Claude/Anthropic SDK, M2 Generate, M3 Adapt AI, M4 Brand Check,
Brand Assessment, approval actions, schedules, publication records, calendar,
performance metrics, or frontend API integration. Phase 5 was not started.

Remaining limitations are the incomplete dedicated assertions noted as
PARTIAL in the matrix, the deferred asset-dependent D-03 gate, the documented
Phase 2 normalization migration risk for non-empty legacy deployments, and the
Prisma tooling audit advisories. None is a known HIGH-severity domain defect.

This is development/thesis implementation readiness, not production
certification. Phase 5 was not started.

**BACKEND PHASE 4 READINESS: READY TO LOCK**
