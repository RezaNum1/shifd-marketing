# Backend Phase 8 — M4 Brand Consistency Checker

## Objective

Phase 8 adds the advisory M4 Brand Consistency Checker. It evaluates one
enabled, current Instagram or LinkedIn Variant against the current canonical
Company, Brand, Product, Brief, Master, and Visual Direction context. It stores
revision- and input-hash-bound evidence without changing editorial content or
granting approval authority.

## Implemented scope

- `POST /api/contents/:id/brand-check`
- immutable M4 `v1` prompt metadata and seed verification
- append-only `brand_assessments`
- `platform_variants.current_assessment_id` with a same-Variant composite FK
- exact M4 output validation and pass/warning consistency checks
- current assessment projection with derived freshness
- M4 AI request logs, usage, idempotency, stale completion handling, and events
- no image bytes, image URLs, OCR, Vision, approval, scheduling, publication, or Performance behavior

## Files changed

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260917100000_phase_8_brand_assessments/migration.sql`
- `backend/src/modules/ai/constants.ts`
- `backend/src/modules/ai/prompt.ts`
- `backend/src/modules/ai/output.ts`
- `backend/src/modules/ai/seed.ts`
- `backend/src/modules/ai/brand-hash.ts`
- `backend/src/modules/ai/brand.ts`
- `backend/src/modules/content/routes.ts`
- `backend/src/modules/content/service.ts`
- `backend/tests/brand.test.ts`
- `backend/tests/ai.test.ts` — removed the obsolete pre-Phase-8 M4-not-found assertion
- `backend/package.json`
- `backend/README.md`

## Migration and schema

The forward-only Phase 8 migration creates `brand_assessments` with UUID
identity, Variant revision, input hash, unique AI request ID, bounded score,
aligned/needs_attention result, recommendation, checks JSONB, creation time,
positive/hash/result/score checks, Variant/date index, and restrictive foreign
keys to `platform_variants` and `ai_request_logs`.

It adds nullable `platform_variants.current_assessment_id` and a composite
foreign key `(platform_variants.id, current_assessment_id)` to
`brand_assessments(variant_id, id)`. This prevents a Variant from pointing to
another Variant's assessment. The migration extends the existing Content Event
constraint with `ai_brand_checked`. No `approval_actions` or later-phase tables
were introduced, and applied Phase 1–7 migrations were not edited.

Assessments are append-only domain records. The current pointer is updated only
after a new successful assessment is inserted. Old rows remain historical
evidence.

## M4 prompt and seed behavior

`M4_PROMPT_TEMPLATE` is a version-controlled server resource with explicit
SERVER INSTRUCTIONS and separate DATA sections for Company, Product, Brand,
Brief, Master, Visual Direction, Variant, platform, and execution metadata.
The prompt prohibits tools, browsing, URL fetching, external enrichment, and
image inspection. It requires stable dimensions: Tone / Brand Voice, Messaging
Alignment, Audience Fit, Claim Grounding, CTA Alignment, Company/Product
Context Alignment, and Platform Appropriateness. It explicitly treats
unsupported claims as ungrounded unless canonical context supports them.

`npm run ai:seed` now verifies immutable M2 `v1`, M3 `v1`, and M4 `v1` metadata
and SHA-256 digests in one transaction. Existing immutable rows are never
silently changed; exactly one active prompt per module is maintained.

## Endpoint and readiness

`POST /api/contents/:id/brand-check` accepts exactly `{ platform }`, requires
the authenticated Phase 2 session, valid Origin, CSRF, current parent
`If-Match`, and `Idempotency-Key`. It rejects unsupported platforms and unknown
body fields. Company ownership comes from `request.auth`; wrong-company
Content is not disclosed.

Before a provider call M4 requires unarchived Content, an enabled target
Variant with complete current copy, a structurally valid Master, saved Brief,
ready Company context, ready Product context for product-scoped Content,
available M4 settings/prompt, and a configured provider. It does not require
Assets or `designStatus=ready`. Readiness failures make no provider call.

## Output validation and semantics

The server accepts only:

```json
{
  "score": 0,
  "status": "aligned",
  "recommendation": "...",
  "checks": [{"label": "Tone / Brand Voice", "status": "pass"}]
}
```

The score is an integer from 0 through 100. Recommendation and checks are
bounded and nonblank; checks contain only approved labels and `pass` or
`warning` statuses. Every check must pass for `aligned`; any warning requires
`needs_attention`. Inconsistent or unknown provider output is
`AI_OUTPUT_INVALID`. No numeric score threshold is invented, and `aligned`
never means Approved.

## Context grounding and freshness

The protected M4 snapshot contains the exact Content/Variant/Brief/Master/
Visual Direction data, resolved live Company/Brand/Product context, context
versions, AI settings, prompt metadata, provider/model/mode/language, and output
schema version. Asset bytes, URLs, storage paths, credentials, cookies, CSRF
tokens, and other secrets are excluded. The deterministic input hash is stored
privately on the assessment and AI request log.

Normal Content reads still resolve live context. Current assessment freshness
is recomputed from the current Variant revision and reconstructed M4 relevant
input hash; a context or relevant Variant change makes the old result stale
without rewriting or deleting its row.

## Request lifecycle and concurrency

M4 follows the Phase 6/7 two-transaction boundary. Phase A locks Content,
checks the ETag, validates readiness, captures the input/hash, handles
idempotency, creates a pending `ai_request_logs` row, links the idempotency
record, and commits. The provider call occurs with no Content lock, bounded
timeout, no transparent paid retry, no tools, and no browsing. Phase D
re-locks Content and the target Variant and rebuilds the relevant input hash.

An initially stale `If-Match` returns `412 REVISION_CONFLICT` without a provider
call. Relevant drift during provider execution returns `409 INPUT_CHANGED`,
marks the request `stale`, retains known usage/latency, and writes no
assessment. Unrelated other-platform editorial changes are not included in the
M4 relevant hash and do not falsely stale a target request.

## Successful revision and event behavior

Success inserts one assessment for the exact target Variant revision and input
hash, points the Variant at it, increments only parent Content `version` once,
finalizes the AI request, and appends one `ai_brand_checked` event. Variant
copy/revision, `editorialRevision`, `masterRevision`, Master, Visual Direction,
Assets, creative reuse, design status, and editorial stage remain unchanged.

The event contains concise request, assessment, prompt, platform, Variant,
score, result, module, and operation metadata. It does not contain snapshots,
prompts, provider responses, bytes, storage paths, checks/recommendation
payloads, or secrets. Events do not determine current state.

## Idempotency and public projections

The existing paid-call-safe idempotency boundary is scoped by Company,
operation/path, actor, Content, platform/Variant, body, ETag, captured input
hash, prompt, model, language, and mode. A pending duplicate returns
`REQUEST_IN_PROGRESS`; a completed duplicate replays the original response
without another provider call, assessment, Content version increment, or event.
Different platform/input/precondition requests use the same key only as an
`IDEMPOTENCY_CONFLICT`. Failed or stale attempts require a new key.

The public assessment projection exposes only ID, Variant ID/revision, score,
status, recommendation, checks, creation time, and derived freshness. Public AI
request and usage APIs naturally include M4 module/operation and Variant ID,
while continuing to hide input snapshots, hashes, prompts, and credentials.

## Tests

`npm run test:brand` was added. `tests/brand.test.ts` uses real PostgreSQL and
an injected deterministic test-only provider. It covers prompt immutability,
auth/Origin/CSRF/ETag/body boundaries, readiness, exact result semantics,
append-only assessment/current pointer behavior, public redaction, revision
rules, stale detection, idempotency replay/conflict, usage, and event safety.

## Validation status

The latest local verification completed successfully against PostgreSQL 16:

- `npm run db:generate` — PASS
- `npx prisma validate` — PASS
- `npm run db:deploy` — PASS; `20260917100000_phase_8_brand_assessments` is applied
- `npx prisma migrate status` — PASS; schema is up to date
- `npm run ai:seed` — PASS; verified immutable active M2 v1, M3 v1, and M4 v1 prompt metadata. Existing M2 and M3 template digests were unchanged
- `npm run test:db` — PASS
- `npm run test:auth` — PASS
- `npm run test:context` — PASS
- `npm run test:content` — PASS
- `npm run test:assets` — PASS
- `npm run test:ai` — PASS
- `npm run test:adapt` — PASS
- `npm run test:brand` — PASS against real PostgreSQL using the deterministic, test-only `FakeAiProvider`; no paid Anthropic call was performed
- `npm run test:unit` — PASS
- `npm run build` — PASS
- `npm audit --omit=dev` — 3 HIGH `deepmerge-ts` advisories remain through Prisma CLI/config tooling; no `npm audit fix --force` was run

The earlier intermittent PostgreSQL connectivity failure at `127.0.0.1:5432`
is obsolete; the complete Phase 8 integration and regression run above passed
against the local PostgreSQL 16 environment.

The successful M4 verification also confirmed that:

- `brand_assessments` are append-only, and `currentAssessmentId` can point only to an Assessment belonging to the same Variant.
- Each Assessment is bound to the exact Variant revision and relevant input hash. Freshness becomes false after relevant Variant or context drift, while historical rows remain unchanged.
- A successful M4 run increments `Content.version` exactly once; Variant revision, `editorialRevision`, `masterRevision`, and `editorialStage` remain unchanged.
- Asset state, attachments, and creative reuse remain unchanged. A stale completion creates no Assessment, and an idempotent replay creates no second Assessment or event.
- An unrelated other-platform edit does not falsely stale the target M4 request.
- No Asset bytes, image URLs, OCR, Vision, or image-generation path was added to M4. M4 does not inspect uploaded creative.
- `aligned` is advisory and does not mean approved. No `approval_actions` table or Human Approval endpoint exists.

## Regression and scope check

No M3/M4 result table other than `brand_assessments` was introduced. There is
still no Human Approval, approval action, schedule, publication, Performance,
asset inspection, OCR, Vision, image generation, browsing, or frontend API
integration. M4 is advisory evidence only.

## Deferred items and limitations

- Human Review and the distinction between advisory assessment and approval remain Phase 9 work.
- No paid real Claude smoke call was performed; the production Anthropic adapter remains the only real provider boundary and integration evidence requires the deterministic test adapter.
- Exactly-once external provider execution is not claimed.
- Interrupted pending AI requests use the existing operator recovery command and are never automatically retried.
- `ai_rate_versions` may remain empty; estimated cost stays unknown until verified rates are configured.
- The Phase 2 legacy normalization migration concern remains documented from earlier phases.
- The Prisma/deepmerge tooling advisory remains documented above.
- Human Review, Scheduling, Publication, and Performance remain deferred.

## Readiness

BACKEND PHASE 8 READINESS: READY TO LOCK

The Phase 8 migration, prompt seed, M4 integration suite, Phase 2–7 regression
suites, unit tests, and build all passed in the latest local PostgreSQL 16
verification. No unresolved HIGH-severity M4 runtime or domain defect remains.

This is development/thesis implementation readiness, not production security
certification.
