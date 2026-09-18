# Backend Phase 6 — M2 Claude Guided Content Generation

## Objective

Phase 6 adds the AI configuration and execution foundation needed for M2, the
guided Claude Content Generator. M2 consumes the live Company/Product context
and saved Content Brief, then writes a validated platform-neutral Master and
Visual Direction. It does not generate platform variants, images, approvals, or
any later workflow state.

## Scope implemented

- Server-only Anthropic configuration and the official `@anthropic-ai/sdk`.
- Injectable `AiProvider` boundary with a production Anthropic adapter and a
  deterministic test adapter.
- AI settings, immutable prompt metadata, request execution evidence, and
  versioned cost-basis tables.
- M2 `POST /api/contents/:id/generate` with readiness validation, bounded
  provider execution, strict output validation, stale-result protection, and
  idempotent replay.
- Settings, prompt metadata, request-log, and usage read APIs.
- Explicit prompt seeding and interrupted-pending-request recovery commands.
- No M3 Adapt or M4 Brand Check endpoint.

Frontend behavior and `frontend-v1` were not modified.

## Files changed

The Phase 6 implementation is contained in:

- `backend/src/modules/ai/` — provider abstraction, Anthropic adapter, prompt,
  output validation, M2 orchestration, APIs, seed, and recovery.
- `backend/src/config/env.ts`, `backend/.env.example`, and `backend/src/app.ts`.
- `backend/src/modules/context/service.ts` and
  `backend/src/modules/content/{routes,service}.ts` for transaction-safe
  context/content integration.
- `backend/src/shared/errors/AppError.ts` for sanitized AI errors.
- `backend/prisma/schema.prisma` and the forward-only
  `20260915100000_phase_6_ai_foundation` migration.
- `backend/tests/ai.test.ts` plus the existing test configuration/cleanup
  updates required by the new restricted relations.
- `backend/package.json` and `backend/package-lock.json`.
- `backend/README.md`.

## Dependencies and configuration

The maintained official Anthropic TypeScript SDK was added. No framework,
agent, vector database, browser integration, image-generation library, or
Canva SDK was added.

The following server-only settings are validated at startup:

- `ANTHROPIC_API_KEY` — optional at startup and never stored in PostgreSQL.
- `ANTHROPIC_MODEL` — optional operator-controlled model selection.
- `AI_REQUEST_TIMEOUT_MS` — default 60,000 ms, bounded to 300,000 ms.
- `AI_MAX_OUTPUT_TOKENS` — default 2,048, bounded to 32,768.

The provider is unavailable without a usable key/model and returns
`AI_NOT_CONFIGURED` at the execution boundary. Public settings expose only
derived readiness, never credentials or raw provider configuration.

Anthropic retries are disabled in the SDK client and request call. The
application does not transparently retry a paid call.

## Migration and AI tables

The forward-only Phase 6 migration introduces only:

- `ai_settings` — one company row; provider/model/mode are operator-controlled,
  while the authenticated settings API can change generation language only.
- `prompt_versions` — immutable prompt metadata with unique
  `(module, version)` and a PostgreSQL partial unique index for one active
  version per module.
- `ai_request_logs` — protected execution evidence, including input snapshot,
  input hash, captured revisions, usage, cost basis, latency, provider request
  ID, status, and sanitized failure information.
- `ai_rate_versions` — empty until a verified operator rate is configured.

It also adds the nullable `request_idempotency.ai_request_id` link and extends
the existing Content Event check for `ai_generated`. No approval, scheduling,
publication, metrics, Brand Assessment, M3, or M4 result table was created.

Existing Companies receive neutral AI settings through the migration. New
Companies receive them through the explicit bootstrap provisioning path. No
API key, prompt body, or fabricated marketing data is stored in settings.

## Provider abstraction and Anthropic adapter

`AiProvider.generate()` receives only server-selected model, bounded timeout and
output-token settings, the immutable server instruction message, and the
separate untrusted data message. `AnthropicAiProvider` uses the official SDK,
does not enable tools or browsing, and normalizes timeout, rate-limit, provider,
and unsupported-response failures into safe internal errors.

The fake provider exists only in the PostgreSQL integration test injection
boundary. It is not a production fallback and is not evidence of a real Claude
call. No real Claude smoke command was added or performed.

## Prompt versioning and security

The canonical M2 v1 prompt is a version-controlled server resource. It
explicitly separates immutable `SERVER INSTRUCTIONS` from
`COMPANY_CONTEXT_DATA`, `PRODUCT_CONTEXT_DATA`, `BRIEF_USER_DATA`, and
execution data. Persisted text is treated as data, not as instructions.

The prompt prohibits browsing, tools, URL fetching, external enrichment, and
unsupported fabrication. Product claims remain bounded by Product Context, and
unsupported customers, certifications, government relationships, guarantees,
performance figures, ROI, revenue, market share, and measured outcomes are not
invented.

`npm run ai:seed` calculates the SHA-256 digest from the canonical resource,
creates/activates M2 v1, retires another active M2 version if necessary, and
refuses to mutate an existing version whose digest or immutable metadata differs.
Prompt APIs return metadata only; they never return template text.

## Context composition and readiness

Each generation resolves current Company Context, current Product Context when
applicable, the saved Brief, current AI settings, and the active prompt version
inside the short preparation transaction. Normal Content reads continue using
live Company/Product projections; an AI input snapshot is historical evidence,
not an inheritance source.

The existing deterministic M1 readiness helpers are reused. Incomplete Company
inputs return `INPUT_NOT_READY`; incomplete product-scoped context returns
`PRODUCT_CONTEXT_INCOMPLETE`. Normal Product and Content CRUD remains available
when AI-specific context is incomplete.

## Input snapshot and hash

The protected snapshot captures Content ID/version, editorial and Master
revisions, stage/design state, enabled platforms, Brief, resolved Company and
Product context, resolved brand, Company/Product context versions, AI settings,
provider/model/mode/language, active prompt metadata, and output schema version.
It excludes credentials, cookies, CSRF tokens, raw authorization, and
filesystem paths.

The snapshot is canonicalized with the existing deterministic hashing boundary
and stored with a SHA-256 `inputHash`. The public request DTO excludes the
snapshot, hash, raw prompt, cost basis internals, and provider secrets.

## M2 request lifecycle and lock boundaries

`POST /api/contents/:id/generate` accepts `{}` only and requires session,
Origin, CSRF, current Content `If-Match`, and `Idempotency-Key`.

Phase A is a short PostgreSQL transaction. It locks the Content, checks the
precondition and editable/archive state, validates the Brief/context, resolves
settings and prompt metadata, handles the scoped idempotency record, and creates
one pending AI request log. The transaction commits before the provider call;
no Content row lock is held during network I/O.

Phase B calls Claude once with bounded timeout/tokens and no transparent retry.

Phase C validates the exact server-owned shape:

```json
{
  "master": {
    "title": "...",
    "coreMessage": "...",
    "hook": "...",
    "body": "...",
    "cta": "..."
  },
  "visualDirection": {
    "format": "...",
    "concept": "...",
    "structure": ["..."],
    "notes": "..."
  }
}
```

Unknown fields, malformed JSON, blank values, empty structure, unsupported
response forms, and oversized fields return `AI_OUTPUT_INVALID`. No partial
Master or Visual Direction write is possible.

Phase D re-locks Content and compares Content revisions, Company
`contextVersion`, Product version, context identity, settings version, and
active prompt ID. A changed input marks the request `stale`, captures known
usage/latency, does not overwrite Content, and returns `INPUT_CHANGED` with the
AI request ID.

An unchanged request atomically writes Master and Visual Direction, sets stage
`generated`, increments Content `version`, `editorialRevision`, and
`masterRevision` once each, preserves Variant copy/revisions and Asset
references, appends one `ai_generated` event, finalizes the AI log, and stores
the successful idempotent response.

## Errors and interrupted requests

The implementation maps failures to `AI_NOT_CONFIGURED`, `AI_TIMEOUT`,
`AI_PROVIDER_ERROR`, `AI_OUTPUT_INVALID`, `INPUT_CHANGED`,
`REQUEST_IN_PROGRESS`, and provider rate-limit `429` responses. Stored error
messages are sanitized and contain no provider body or stack trace.

Pending requests are never automatically re-executed. The restricted operator
command `npm run ai:recover [minutes]` marks pending requests older than the
configured command threshold (15 minutes by default) as failed with
`AI_INTERRUPTED`; it never calls Claude. A timeout or provider ambiguity may
have incurred provider usage, so the log does not claim exactly-once provider
execution.

## Idempotency

The existing bounded `request_idempotency` infrastructure is reused. The M2
operation is content-scoped and the request hash includes Company, actor,
operation/path, Content ID, body, `If-Match`, captured input hash, prompt
version, model, language, and mode. The database link associates the key with
the AI request record in the preparation transaction.

Completed same-key requests replay the stored response without another provider
call. Pending same-key requests return `REQUEST_IN_PROGRESS` and the AI request
ID. Different body, precondition, actor, or captured request identity returns
`IDEMPOTENCY_CONFLICT`. Failed/stale provider attempts are not transparently
replayed as a new paid execution; an explicit retry uses a new key.

## Content revision behavior

Successful M2 generation replaces only Master and Visual Direction. It does not
create a second Content, generate platform variants, alter copy, alter Variant
revision, or delete Asset records/references. Existing
`adaptedFromMasterRevision` values remain historical, so previously adapted
copies become stale naturally after `masterRevision` advances.

Changing the generation language affects subsequent calls only. Historic input
snapshots remain unchanged. No approval, assessment, schedule, publication, or
image state is claimed by M2.

## APIs

Implemented authenticated routes:

- `POST /api/contents/:id/generate` — M2 Master + Visual Direction.
- `GET /api/settings/ai` and `PUT /api/settings/ai` — read settings and update
  generation language only; PUT uses ETag/If-Match, Origin, and CSRF.
- `GET /api/prompt-versions` and `GET /api/prompt-versions/:id` — metadata-only
  stable reads.
- `GET /api/ai-requests` and `GET /api/ai-requests/:id` — Company-scoped,
  sanitized execution evidence.
- `GET /api/ai-usage` — Company-scoped half-open time range and separate real or
  demo usage.

No M3/M4 endpoint was added.

Usage sums only known token/cost values and reports unknown usage/cost request
counts. With the initial empty `ai_rate_versions` table, estimated runtime cost
is `null`, not zero. Real and demo usage are never mixed.

## Tests

`npm run test:ai` requires `DATABASE_URL`, sets `REQUIRE_DATABASE=1`, and runs
`tests/ai.test.ts` against PostgreSQL with an injected FakeAiProvider. The suite
covers settings and secret boundaries, prompt digest metadata, auth/Origin/CSRF
/ETag/idempotency requirements, exact output persistence, revisions, event
creation, replay, incomplete context, invalid output, provider failure, timeout,
stale Content completion, and pending-request single-call behavior.

The test suite was expanded to use typed fake timeout/provider failures and to
assert the canonical prompt digest. No paid Claude call is made.

## Validation results

Recorded latest local command results against PostgreSQL 16:

- `npm run db:generate` — PASS.
- `npx prisma validate` — PASS.
- `npm run db:deploy` — PASS; no pending migrations.
- `npx prisma migrate status` — PASS; seven migrations applied and schema up
  to date.
- `npm run ai:seed` — PASS; the immutable M2 v1 prompt metadata and digest
  verified successfully.
- `npm run test:db` — PASS in the latest successful run.
- `npm run test:auth` — PASS in the latest successful run; 5 tests.
- `npm run test:context` — PASS against real PostgreSQL.
- `npm run test:content` — PASS against real PostgreSQL.
- `npm run test:assets` — PASS against real PostgreSQL.
- `npm run test:ai` — PASS against real PostgreSQL; 8 tests, 0 failed.
- `npm run test:unit` — PASS; 10 tests, with database suites skipped when the
  command does not set `REQUIRE_DATABASE`.
- `npm run build` — PASS.
- `npm audit --omit=dev` — command completed with three HIGH advisories in the
  existing Prisma/deepmerge tooling chain. No Sharp/libvips advisory remains
  in the current report. `npm audit fix --force` was not run because it
  proposes breaking dependency changes.

The earlier managed-shell `P1001` connectivity blocker is superseded by this
successful local PostgreSQL 16 run. No SQLite or mocked Prisma was used as
integration evidence.

## Phase 2–5 regressions and scope check

Authentication source boundaries remain shared and the Phase 2 auth suite
passed. The Phase 3 context, Phase 4 Content, and Phase 5 Asset regressions also
passed in the latest real PostgreSQL run. No Phase 7+ implementation was added.

Source inspection confirms no Phase 7+ implementation: no M3 Adapt, M4 Brand
Check, approval actions, schedules, publication, performance/metrics,
Anthropic tool use, image generation, Canva integration, browser/search
integration, AI agents, or frontend API replacement exists.

## Deferred items and limitations

- No M3 platform adaptation or M4 Brand Check is implemented.
- No Human Review, approval, Request Revision, scheduling, publication, or
  Performance domain exists.
- No real Claude smoke call was performed; automated tests deliberately avoid
  provider cost.
- `ai_rate_versions` remains empty until a verified operator rate is supplied;
  runtime estimated cost is therefore unknown/null.
- Pending request recovery is an operator command, not a queue or distributed
  worker. Filesystem/provider and database execution are not a distributed
  transaction, and exactly-once provider execution cannot be claimed.
- The bounded Phase 3 idempotency table is reused rather than generalized into
  a future AI job lifecycle.
- Existing Phase 2 normalization migration concerns remain documented and
  untouched.
- The latest `npm audit` output includes the noted Prisma/deepmerge tooling
  advisory; no forced upgrade was applied. Sharp/libvips runtime advisories are
  cleared at the patched Sharp version.

This is development/thesis implementation readiness, not production
certification.

## Security Stabilization

- The Asset subsystem was upgraded from Sharp `0.34.5` to `0.35.4`, including
  the corresponding libvips platform packages in `package-lock.json`.
- The current `npm audit --omit=dev` report no longer includes the Sharp/libvips
  runtime advisories. Three HIGH findings remain in the Prisma CLI/configuration
  dependency chain (`deepmerge-ts`); these are the previously documented
  development/tooling findings and would require the rejected breaking
  `npm audit fix --force` path.
- Sharp API compatibility was verified for metadata extraction from the
  extensionless private temporary files used by AssetStorage. The existing
  actual-byte signature boundary and error semantics remain unchanged: actual
  unsupported formats map to 415, while malformed supported PNG/JPEG bytes
  map to 422.
- Sharp's documented libvips operation allowlist is now applied at the Asset
  storage boundary: only JPEG and PNG file loaders are unblocked. SVG, WebP,
  TIFF, GIF, HEIF, and other foreign loaders are not enabled for this upload
  path. No extension or browser MIME value is trusted.
- `npm run test:assets` passed with 9 tests and 0 failures after the upgrade.
  The strict validation path retains the 415 unsupported-actual-format versus
  422 malformed-supported-format distinction.

## Final Verification and Stabilization

The final PostgreSQL verification also confirmed the following Phase 6
stabilization corrections:

- Non-auth integration tests use a sufficiently high test-only login rate-limit
  configuration when they reuse an application instance. Production login
  rate limiting and the dedicated Phase 2 rate-limit test remain unchanged.
  AI test login helpers now check for HTTP 200 and report a safe status/body
  diagnostic before extracting the CSRF token.
- M2 distinguishes an already-stale `If-Match` from input drift after valid
  preparation. The former returns `412 REVISION_CONFLICT` without a provider
  call. The latter marks the request `stale`, preserves known usage/latency,
  leaves Content and events unchanged, and returns `409 INPUT_CHANGED` with
  the AI request ID.
- Production `AI_REQUEST_TIMEOUT_MS` remains 60 seconds. The AI integration
  app injects a small deterministic timeout only for testing. Timeout,
  provider failure, and invalid structured output remain distinct as
  `504 AI_TIMEOUT`, `502 AI_PROVIDER_ERROR`, and `502 AI_OUTPUT_INVALID`.
- Pending M2 idempotency was verified: a same-key duplicate returns
  `409 REQUEST_IN_PROGRESS` without a second provider call; releasing the
  original deterministic provider completes it successfully. A completed
  replay returns the stored result without a second `ai_generated` event.
- `FakeAiProvider` state is reset around every test. Blocking, timeout, failure,
  output, usage, request capture, and call-count state cannot leak between
  cases. It remains test-only and is not a production fallback.
- `npm run test:ai` passed all 8 tests with no paid Claude call. This is valid
  Phase 6 evidence because the production Anthropic adapter is implemented and
  the integration suite exercises the M2 domain against real PostgreSQL with
  an injected deterministic provider.

## Readiness

BACKEND PHASE 6 READINESS: READY TO LOCK

This is development/thesis implementation readiness, not production security
certification.

Phase 7 was not started.
