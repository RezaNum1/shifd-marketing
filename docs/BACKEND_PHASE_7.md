# Backend Phase 7 — M3 Cross-Platform Adaptation

## Objective

Phase 7 adds the M3 persistence and execution boundary for adapting the current
canonical Master Content to one enabled platform at a time. M3 writes only the
requested Platform Variant copy fields. It does not create a new Master, create
Assets, call tools, browse the web, assess the Brand, or approve Content.

## Implemented scope

- Added the `POST /api/contents/:id/adapt` command.
- Added a version-controlled M3 `v1` prompt resource and extended `npm run ai:seed`.
- Reused Phase 6 `AiProvider`, Anthropic adapter, request logs, settings, usage,
  cost, input snapshot, and paid-call-safe idempotency boundaries.
- Added strict M3 output validation for `{ copy, cta, hashtags,
  visualRecommendation }`.
- Added a forward-only `ai_adapted` Content Event type.
- Added a real-PostgreSQL `npm run test:adapt` suite using a test-only injected
  deterministic provider.

No Phase 8 or M4 domain was added.

## Files changed

- `backend/src/modules/ai/adapt.ts` — M3 Phase A/provider/validation/Phase D orchestration.
- `backend/src/modules/ai/prompt.ts` — immutable M3 server prompt and renderer.
- `backend/src/modules/ai/output.ts` — exact M3 result validation.
- `backend/src/modules/ai/constants.ts` — M3 operation/schema constants.
- `backend/src/modules/ai/seed.ts` — atomic M2/M3 prompt verification and seeding.
- `backend/src/modules/ai/service.ts` — exported shared AI DTO/provider/usage mappers.
- `backend/src/modules/content/routes.ts` — authenticated M3 route and exact request parser.
- `backend/tests/adapt.test.ts` — dedicated PostgreSQL M3 integration suite.
- `backend/tests/ai.test.ts` — removed the obsolete Phase 6 assertion that M3 was not yet routed.
- `backend/package.json` — `test:adapt` script.
- `backend/prisma/migrations/20260916100000_phase_7_m3_adaptation/migration.sql`.
- `backend/README.md`.

## Migration and schema

M3 reuses the Phase 4–6 `contents`, `platform_variants`, `prompt_versions`,
`ai_settings`, `ai_request_logs`, `ai_rate_versions`, and
`request_idempotency` tables. No adaptation-result table was created.

The forward-only migration extends the PostgreSQL `content_events.event_type`
check to allow `ai_adapted`. M3 AI request logs use the existing fields with
`module = M3`, `operation = adapt`, the Content ID, and the requested Variant
ID. The existing ownership and Variant uniqueness constraints remain in force.

## Prompt and output

`m3-adapt-v1` is seeded as `module = M3`, `operation = adapt`, `version = v1`,
and `status = active`, with output schema `m3.adapt.v1`. The seed verifies the
existing M2 `v1` digest and metadata first, then verifies or creates M3 `v1`.
Existing immutable metadata or digest mismatches fail rather than being
silently rewritten. Active prompt uniqueness remains database-backed by the
existing Phase 6 partial index.

The prompt separates server instructions from Company, Product, Brief, Master,
Visual Direction, target platform, and execution data. Persisted text is
untrusted data. The no-tools, no-browsing, and claim-grounding rules remain in
the server instruction section. Generation language is the server-resolved AI
setting, not a browser-supplied prompt option.

The application accepts only the exact M3 result shape. All four values are
nonblank bounded strings; unknown output properties and malformed results map
to `AI_OUTPUT_INVALID`. Hashtags remain the existing Variant string field.

## Endpoint and readiness

`POST /api/contents/:id/adapt` accepts only `{ platform }`, where platform is
`instagram` or `linkedin`. It requires the authenticated Phase 2 session,
valid Origin, CSRF, the current parent Content ETag, and `Idempotency-Key`.
Wrong-company Content is invisible as `NOT_FOUND`; initial stale `If-Match` is
`REVISION_CONFLICT`.

Before a provider call the service requires an unarchived Content with a saved
Brief, structurally valid Master, existing enabled target Variant, ready
Company context, ready Product context for product-scoped Content, AI settings,
active M3 prompt, and a configured provider. Missing Product readiness maps to
`PRODUCT_CONTEXT_INCOMPLETE`; other missing canonical data maps to
`INPUT_NOT_READY`. Assets, `designStatus`, Brand Assessment, and Human Review
are intentionally not readiness requirements for M3.

Instagram receives caption-oriented, concise and engaging platform guidance.
LinkedIn receives professional, consultative and problem-led guidance. Both
adapt the same Master and remain grounded in live resolved context. M3 never
changes the Master or generates images.

## Request lifecycle and concurrency

Phase A locks the parent Content briefly, validates the current ETag and
readiness, resolves the target Variant/context/settings/prompt, constructs a
relevant input snapshot and SHA-256 hash, creates one pending AI request log,
and creates its idempotency record. The lock is released before the provider
call. The request snapshot contains the accepted Content/revision values,
target Variant identity/revision, Brief, Master, Visual Direction, live
Company/Product/resolved Brand data, context versions, AI settings, prompt
metadata, provider/model/mode/language, and schema version. It excludes keys,
cookies, CSRF tokens, paths, storage keys, and other secrets.

Phase D locks the parent again and rebuilds the relevant M3 input. It compares
Master/Visual Direction/Brief, Master revision, target Variant revision and
enabled state, Company context version, Product version, AI settings, prompt
identity, provider/model/mode/language, and other captured target inputs. A
change marks the log `stale`, records known usage/latency, writes no Variant,
and returns `409 INPUT_CHANGED`. It does not map valid post-call drift to a
generic `412`.

The relevant hash intentionally excludes unrelated other-platform copy and
Asset/reuse state because those values are not M3 inputs. An unrelated platform
edit can therefore complete without falsely staling the target request. The
initial HTTP ETag remains mandatory and is checked before provider execution.

The provider is called once outside database locks. Existing timeout, provider
failure, rate-limit, invalid-output, and no-transparent-retry behavior is
reused. Pending requests are not automatically retried; the Phase 6 operator
recovery policy remains authoritative.

## Variant and Content revisions

On success, only the requested Variant receives `copy`, `cta`, `hashtags`, and
`visualRecommendation`. Its revision increments once and
`adaptedFromMasterRevision` becomes the current Master revision. Content
`version` and `editorialRevision` each increment once. `masterRevision` is
unchanged. The other Variant, Master, Visual Direction, Asset links, and
LinkedIn creative-reuse pointer are untouched.

After the write, enabled Variants are evaluated deterministically. If every
enabled Variant has complete copy current for the Master revision, the stored
editorial stage becomes `adapted`; otherwise it becomes `generated`. M3 never
advances to Creative In Progress or Ready for Review. Re-adaptation replaces
only the requested platform copy and applies the same revision rules. Existing
copy is not erased merely because another platform is adapted.

The resulting lifecycle and resume values remain derived from the existing
Phase 4 selector. No lifecycle mirror or resume field is persisted.

## Idempotency and events

M3 uses the shared request idempotency table with a content-scoped
`content.adapt` operation. The request hash includes Company, actor, path,
Content, target platform and Variant, request body, ETag, captured relevant
input hash, prompt, model, language, and mode. A pending same-key retry returns
`REQUEST_IN_PROGRESS` with its AI request ID. A completed same-key retry
replays the stored response without another provider call, Variant revision, or
event. Different platform/body/precondition/identity conflicts are rejected.

The domain write and successful idempotency response are finalized in the same
transaction. A successful M3 command appends exactly one `ai_adapted` event
with concise AI request, prompt, platform, and Variant identifiers. The event
does not carry prompt text, snapshots, provider output, storage information,
or secrets. Failed, stale, and replayed requests do not append a second
semantic generation event.

## Existing AI API integration

The existing read-only prompt API returns M3 metadata but never template text.
AI request list/detail APIs naturally expose M3 logs and target `variantId`
within the authenticated Company. AI usage includes M3 while preserving
real/demo separation and unknown token/cost coverage. No unverified runtime
pricing was added; unknown estimated cost remains `null`.

## Tests

The dedicated suite covers prompt seed stability, auth/Origin/CSRF/ETag and
body boundaries, target/platform readiness, exact output, target isolation,
revision/stage semantics, relevant-vs-unrelated drift, stale preservation,
provider failure/timeout/invalid output, pending/completed idempotency, request
log privacy, and `ai_adapted` event behavior. It uses a real PostgreSQL
database and an injected deterministic FakeAiProvider; no paid Anthropic call
is made by automated tests.

## Validation status

The latest local PostgreSQL 16 verification completed successfully:

- `npm run db:generate` — PASS.
- `npx prisma validate` — PASS.
- `npm run db:deploy` — PASS; the Phase 7 migration is applied.
- `npx prisma migrate status` — PASS; the database schema is up to date.
- `npm run ai:seed` — PASS; both immutable M2 `v1` and immutable/active M3 `v1`
  metadata and digests were verified. The existing M2 `v1` prompt digest was
  unchanged.
- `npm run test:db` — PASS.
- `npm run test:auth` — PASS.
- `npm run test:context` — PASS.
- `npm run test:content` — PASS.
- `npm run test:assets` — PASS.
- `npm run test:ai` — PASS.
- `npm run test:adapt` — PASS against real PostgreSQL using the deterministic,
  test-only `FakeAiProvider`; no paid Anthropic call was made.
- `npm run test:unit` — PASS.
- `npm run build` — PASS.
- `npm audit --omit=dev` — reports the previously documented 3 HIGH
  `deepmerge-ts` advisories through Prisma CLI/config tooling. The available
  fix requires `npm audit fix --force` and a breaking Prisma change; it was not
  run. No Phase 7 runtime dependency was added.

No unresolved HIGH-severity M3 runtime or domain defect remains in the latest
verification.

## Deferred features and limitations

- No M4 Brand Check, Human Review, Approval, schedule, publication, or
  performance domain exists.
- No M3 real paid Claude smoke call was performed; injected provider tests are
  not evidence of external provider execution.
- Exactly-once external provider execution is not claimed.
- Interrupted pending AI requests require the existing restricted operator
  recovery command and are never automatically rerun.
- `ai_rate_versions` may remain empty until verified provider pricing is
  configured; runtime cost is then unknown rather than zero.
- Phase 2 legacy normalization migration concerns remain documented.
- Prisma/deepmerge tooling advisories remain as described above.
- Asset persistence, D-03, and all Phase 5 limitations remain unchanged.

This is development/thesis implementation readiness, not production security
certification.

BACKEND PHASE 7 READINESS: READY TO LOCK

No Phase 8 work was started.
