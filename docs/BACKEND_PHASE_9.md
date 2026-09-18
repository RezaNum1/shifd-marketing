# Backend Phase 9 — Human Review, Override, Approval, and Request Revision

## Objective

Phase 9 adds the human decision boundary after the advisory M4 Brand
Consistency Checker. It persists justified warning overrides, final approval
evidence, explicit revision requests, and review history. It derives Approved
from current, revision-bound evidence and does not add Scheduling, Publication,
Performance, or new AI behavior.

## Scope implemented

- `approval_actions` append-only human review evidence.
- `contents.current_approval_id` with a same-Content composite foreign key.
- Warning override, final approval, request revision, and review-history APIs.
- Current approval projection and derived `Approved` lifecycle/resume state.
- D-02 reviewed-content write protection across editorial, AI, Asset, and reuse
  mutations.
- The existing conditional D-03 creative eligibility rule for approval.
- Concise review Content Events.
- Parent-lock and idempotency handling for review commands.

No frontend-v1 code was modified. No schedule, publication, metrics, approval
table beyond this phase, or additional AI behavior was introduced.

## Files changed

- `backend/prisma/schema.prisma` — ApprovalAction model and Content/Variant/
  Assessment/User relations.
- `backend/prisma/migrations/20260918100000_phase_9_human_review/migration.sql`
  — forward-only Phase 9 PostgreSQL migration.
- `backend/src/modules/review/service.ts` — review transactions, evidence,
  locks, idempotency, and projections.
- `backend/src/modules/content/routes.ts` — review endpoints and strict input
  parsers.
- `backend/src/modules/content/service.ts` — approval projection, validity,
  Approved lifecycle, and write-gate integration.
- `backend/src/modules/content/lifecycle.ts` — Approved and schedule resume
  derivation.
- `backend/src/modules/ai/service.ts`, `ai/adapt.ts`, and `ai/brand.ts` —
  reviewed-content write gates and protection of in-flight AI completions.
- `backend/src/modules/assets/service.ts` — reviewed-content attachment/reuse
  write gate.
- `backend/src/shared/errors/AppError.ts` — `REVIEW_LOCKED` domain error.
- `backend/package.json` — `test:review` command.
- `backend/tests/review.test.ts` — real-PostgreSQL Human Review integration
  coverage.
- `backend/README.md` — Phase 9 operation and safety documentation.

## Migration and schema

The migration creates `approval_actions` with UUID identity, Content/Variant/
Assessment/actor references, editorial revision, action, justification,
checklist, reviewed-Variant evidence, and creation time. It enforces approved
action values, positive editorial revisions, and nonblank justification for
override/request-revision rows. It adds indexes for Content history, Variant,
and Assessment lookups.

The `(content_id, variant_id)` foreign key prevents an action from referring to
a Variant owned by another Content. The `(variant_id, assessment_id)` foreign
key prevents an action from referring to an Assessment owned by another
Variant. `contents.current_approval_id` uses `(content.id,
current_approval_id) → approval_actions(content_id,id)`, preventing a
cross-Content current pointer. Domain checks additionally require that the
current pointed action is an `approve` action bound to the current editorial
revision and valid review evidence.

The Content Event check was extended forward-only for:

- `review_override_recorded`
- `content_approved`
- `revision_requested`

No schedule, publication, metrics, or future approval tables were created.

## Endpoints

- `POST /api/contents/:id/override` — records a justified override for the
  exact current warning Assessment.
- `POST /api/contents/:id/approve` — records final human approval using the
  exact five-item all-true checklist.
- `POST /api/contents/:id/request-revision` — clears current approval and
  explicitly unlocks a reviewed Content for a new editorial cycle.
- `GET /api/contents/:id/review-actions` — returns actual, paginated,
  company-scoped review history, including superseded actions.

Mutations reuse the Phase 2 authenticated session, Origin, CSRF, parent
Content `If-Match`, shared error envelope, and request idempotency boundary.
Wrong-company resources remain `NOT_FOUND`. Reads are authenticated and
side-effect free.

## Override semantics

An override requires an enabled target Variant, its current Assessment, a
fresh `needs_attention` result, exact Variant revision binding, current Content
editorial revision, and a bounded nonblank justification. An aligned result or
stale Assessment cannot be overridden.

Override is human evidence only. It does not change the Assessment, score,
Variant, Assets, Content editorial revision, Master revision, or editorial
stage. It increments only Content `version` once and appends
`review_override_recorded`. Previous overrides remain immutable history.

## Approval readiness and checklist

Approval locks the parent Content and enabled Variants in stable ID order. It
requires unarchived Content in `ready_for_review`, a valid Brief and Master,
at least one enabled Variant, complete current adaptations for all enabled
Variants, and a fresh current Assessment for every enabled Variant.

Aligned Assessments need no override. A warning Assessment needs a current
override bound to the exact Assessment ID, Variant, Variant revision, and
Content editorial revision. The score is advisory; no unapproved numeric score
threshold is invented.

The request accepts exactly these five Boolean fields, all `true`:

```json
{
  "copyReviewed": true,
  "creativeReviewed": true,
  "visualCopyConsistent": true,
  "noErrors": true,
  "readyForPublication": true
}
```

The server constructs `reviewedVariants` evidence. Each enabled Variant is
bound to its Variant revision, current Assessment, Assessment status, any
override, and ordered effective Asset IDs. The browser cannot submit this
snapshot, and it is not a second writable copy of Variant content.

The D-03 rule is preserved exactly: if `designStatus` is not `ready`, missing
creative Assets alone do not block approval; if it is `ready`, every enabled
Variant needs an effective creative Asset. LinkedIn creative reuse satisfies
that effective-Asset condition. Adaptation, Assessment freshness, and all
other review prerequisites remain required.

On success, one immutable `approve` action is inserted and
`current_approval_id` is set in the same transaction. Content `version`
increments once. `editorialRevision`, `masterRevision`, Variant revisions,
copy, Assets, reuse, design status, and editorial stage do not change. One
`content_approved` event is appended. M4 `aligned` remains advisory and never
creates approval by itself.

## Current approval and lifecycle

The `approval` Content projection is present only when the current pointer
still identifies an `approve` action for the same Content and current
editorial revision, and its reviewed Variant/Assessment/override/effective
Asset evidence still matches live state. Assessment freshness is reconstructed
from the existing M4 relevant input hash. Variant or relevant context drift
makes the historic approval non-current without rewriting the action.

When the projection is valid, lifecycle derives `Approved` and resume step
`schedule`; `editorialStage` remains `ready_for_review`. Archived Content still
derives `Archived` with no approval projection. Invalid or superseded approval
actions remain available in review history.

## Request Revision

`request-revision` requires a nonblank bounded reason and a reviewed workflow
state. It inserts immutable `request_revision` evidence, clears
`current_approval_id`, sets `editorialStage` to `needs_revision`, increments
Content `version` exactly once, leaves `editorialRevision` unchanged, and
appends `revision_requested`. Master, Variant, Assessment, Asset, and prior
review history are preserved.

Request Revision only opens the write boundary. The next actual editorial
mutation owns its ordinary `editorialRevision`/child revision increment and
invalidates the old evidence through its normal content semantics. Future
Scheduling will own cancellation of unpublished schedules; no schedule rows
exist in Phase 9.

## D-02 reviewed-content write protection

While a valid approval exists, the following review-affecting writes return
`409 REVIEW_LOCKED` until Request Revision is accepted:

- Brief, Master, Visual Direction, enabled-platform, and design-status edits.
- Variant copy and progress writes.
- M2 generation, M3 adaptation, and M4 assessment reruns.
- Asset attachment/reorder/removal and LinkedIn creative reuse.

The gate is evaluated from live approval evidence, not merely a Boolean or
presence of an old action. Archive and duplicate remain available: archive
preserves the reviewed history and duplicate creates a fresh Draft with no
approval actions. In-flight M2/M3/M4 completions re-check the review lock under
the final Content lock so an already accepted approval cannot be overwritten by
a late provider result.

## History, idempotency, and concurrency

Review actions and events are append-only application records. Events contain
only concise IDs, platform, action, revision, and reason metadata; they never
contain passwords, cookies, CSRF tokens, AI snapshots, full copy, Assessment
checks, storage keys, or Asset bytes. Events do not determine current state.

Review command idempotency is scoped by authenticated Company and operation,
with actor, Content identity, request body, and parent precondition included in
the deterministic request hash. Same-key retries replay the exact response
without another action, event, or Content version increment. A changed body,
Content identity, path/operation, or precondition returns
`IDEMPOTENCY_CONFLICT`. Parent Content locking serializes approval against
override, revision, editorial, AI, Asset, and reuse races; double approval
with separate keys resolves as one successful serialization and one stale
precondition.

## Tests

`npm run test:review` was added. It is configured to require
`DATABASE_URL`/`REQUIRE_DATABASE=1`, uses real PostgreSQL, and uses no AI call.
The integration fixture uses a deterministic test provider only to create M4
assessment setup data. It exercises approval evidence, warning override,
checklist and D-03 gates, lifecycle projection, revision unlock, auth/Origin/
CSRF/ETag/idempotency boundaries, company isolation, and review history.

## Validation status

Schema and build checks completed in the available local run:

- `npm run db:generate` — PASS.
- `npx prisma validate` — PASS.
- `npm run db:deploy` — PASS; the Phase 9 migration was applied and subsequent
  deployment reported no pending migrations.
- `npx prisma migrate status` — PASS; 10 migrations found and schema up to
  date.
- `npm run test:db` — PASS in the latest successful database probe.
- `npm run test:auth` — PASS; all 5 Phase 2 authentication tests passed in the
  latest successful run.
- `npm run test:unit` — PASS; 10 tests passed, database suites were skipped by
  the unit command as designed.
- `npm run build` — PASS.
- `npm audit --omit=dev` — 3 HIGH `deepmerge-ts` advisories remain through
  Prisma CLI/config tooling. The available remediation requires a breaking
  Prisma change and `npm audit fix --force` was not run.

`npm run test:review` was attempted with `REQUIRE_DATABASE=1` but the managed
execution shell could not connect to PostgreSQL at `127.0.0.1:5432`; Vitest
therefore skipped the four integration cases and failed its `beforeAll` at
Prisma connection. This is an environment blocker, not evidence of a passing
Phase 9 integration suite. The suite must be rerun with the local PostgreSQL
16 service reachable before lock readiness can be claimed.

`npm run test:context` was also attempted during regression and hit the same
intermittent PostgreSQL connection failure. Phase 4–8 dedicated integration
commands were not rerun in this implementation attempt; their locked reports
retain their prior recorded results.

The Phase 1–8 reports remain locked and contain their previously recorded
regression results.

## Deferred items and limitations

- Scheduling, Calendar, Publication, Performance, and published-variant
  immutability remain deferred.
- M4 remains advisory; `aligned` is not approval.
- No approval action can certify an Asset visually; D-03 only evaluates the
  approved conditional effective-Asset rule.
- Exactly-once external provider execution remains outside this phase.
- Interrupted AI request recovery and AI rate configuration remain owned by
  Phase 6.
- The existing Phase 2 legacy normalization migration concern remains
  documented in earlier reports.
- Prisma/deepmerge tooling advisories remain as listed above.

This is development/thesis implementation readiness, not production security
certification.

BACKEND PHASE 9 READINESS: BLOCKED

Exact blocker: the real PostgreSQL Phase 9 integration suite could not connect
to `127.0.0.1:5432` in the managed execution shell. No Phase 10 work was
started.
