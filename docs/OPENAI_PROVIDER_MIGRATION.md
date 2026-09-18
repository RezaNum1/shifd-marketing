# OpenAI Provider Migration

Status: provider implementation for the existing Phase 12 application; this is
not a new feature phase. No tag has been created. M2/M3/M4, their prompt v1 text and
digests, workflow, persisted evidence, validation rules, idempotency, revisions,
stale-result handling, human review, scheduling, and publication semantics are
unchanged.

## Why and what changed

The production AI provider boundary has moved from Anthropic/Claude to OpenAI
for the current deployment. The provider and model selection is server-owned;
the chosen model is GPT-5.6 Luna (`gpt-5.6-luna`). This migration changes the
provider adapter, server configuration, and current provider identity only.
It does not change the thesis workflow or add image generation.

The existing `AiProvider` interface remains the common M2/M3/M4 boundary. The
production `OpenAiAiProvider` uses the official Node/TypeScript `openai` npm
package and `client.responses.create(...)`. The old `@anthropic-ai/sdk` runtime
dependency was removed only after confirming the application no longer imports
it. Deterministic `FakeAiProvider` instances remain injected by integration
tests; no automated test calls the paid API.

| Existing Shifd input/output | OpenAI Responses mapping |
| --- | --- |
| Immutable server instruction | `instructions` |
| Persisted/user context and brief | User `input` text |
| Server-selected model | `model` from current settings / server environment |
| M2/M3/M4 output contract version | Server-owned strict JSON Schema via `text.format.type = json_schema` |
| Canonical usage | `usage.input_tokens` → `inputTokens`; `usage.output_tokens` → `outputTokens` |
| Provider request ID | SDK `withResponse().request_id`, then response `_request_id` / `id` fallback |

GPT-5.6 Luna supports the Responses API, Structured Outputs, and low reasoning
effort according to [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
The adapter uses low reasoning effort, strict server-owned schemas for the
existing M2/M3/M4 result shapes, and the existing server-side validators as a
second boundary. Refusal, incomplete, empty, unsupported, non-object, or
invalid JSON output maps into the existing `AI_OUTPUT_INVALID` contract.

## Request safety and errors

- The official SDK client and each call specify `maxRetries: 0`; Shifd adds no
  provider retry. One logical execution issues at most one normal Responses API
  request.
- The existing `AI_REQUEST_TIMEOUT_MS` bounds the client and request timeout.
- Every Responses API call explicitly sets `store: false`; Shifd retains its
  required evidence in `ai_request_logs`.
- M2/M3/M4 pass no tools, function handlers, web/file search, computer use,
  image generation, or other external capabilities.
- OpenAI timeout, 429, authentication/configuration, connection, server, and
  malformed-response cases normalize through existing safe Shifd errors. Raw
  SDK errors, provider bodies, headers, keys, and stack traces are not returned
  to browsers.
- Missing usage remains `null`. No reasoning-token billing field is added.
  Estimated cost remains `null` when no verified OpenAI `ai_rate_versions`
  record exists; no historical or new rates are invented here.

## Environment and database

Replace `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` with:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

The example key is intentionally empty. `OPENAI_API_KEY` remains optional at
startup. If no key or selected model is available, HTTP AI execution continues
to return `503 AI_NOT_CONFIGURED`; the application does not fail startup. The
key is not returned from settings, placed in `VITE_*`, frontend source,
PostgreSQL, snapshots, request logs, or request logging.

Migration `20260921100000_openai_provider` is forward-only. It updates current
`ai_settings` rows to `provider=openai`, `model_id=gpt-5.6-luna`,
`model_display_name=GPT-5.6 Luna`, and `mode=real`; it increments settings
version and leaves the user-owned generation language unchanged. New company
bootstrap uses the same canonical provider/model identity without requiring a
key. The SQL provider checks accept both `anthropic` and `openai` so historical
evidence remains valid. No new AI settings table is introduced, and Prisma
fields remain unchanged because the provider constraints are SQL migration
constraints.

Existing `ai_request_logs` and `ai_rate_versions` rows are not rewritten.
Historical logs with `provider=anthropic` remain unchanged and readable; new
M2/M3/M4 snapshots and logs record `provider=openai` and the selected model
`gpt-5.6-luna`. Rate selection stays unchanged and returns unknown cost when no
OpenAI rate version exists.

## Prompt and frontend compatibility

The canonical M2/M3/M4 prompts are provider-neutral and contain no Claude or
Anthropic naming, so their v1 resources and immutable digests are unchanged.
Settings render provider/model/status from backend metadata. The frontend
settings UI was not redesigned; legacy mock request labels were aligned to
OpenAI / GPT-5.6 Luna. With no API key, expected settings are OpenAI / GPT-5.6
Luna / Not configured.

The original [Phase 6](BACKEND_PHASE_6.md), [Phase 7](BACKEND_PHASE_7.md),
[Phase 8](BACKEND_PHASE_8.md), and [Phase 12](PHASE_12_FRONTEND_BACKEND_INTEGRATION.md)
reports are historical records and are intentionally not rewritten.

## Verification record

- Verification date: 2026-09-15. No key was configured, no paid OpenAI call
  was made, and no tag was created.
- Backend runtime: `.nvmrc` Node `v22.11.0` / npm `10.9.0`, **PASS** against
  the backend engine range `>=22.11.0 <23`. `npx prisma validate` and
  `npm run db:generate`: **PASS**. Backend `npm run build`: **PASS** on Node
  22.11.0.
- Docker/PostgreSQL: `docker info` reached the client but failed to query the
  daemon (`permission denied` on the Docker API socket). `docker compose up
  -d` and `docker compose ps` succeeded; the PostgreSQL 16 container was Up,
  and `pg_isready` reported that it was accepting connections. Host-side
  Prisma/Node processes in this environment could not reach the published
  `127.0.0.1:5432` port (P1001).
- Migration status: **PASS**. The database migration ledger contains a finished
  `20260921100000_openai_provider` row, and the earlier migration verification
  reported the database up to date. The current `npx prisma migrate status`
  invocation could not complete because of the host-side P1001 connection
  failure. No migration file was edited or recreated in this verification.
- Read-only database audit: one current settings row is
  `provider=openai`, `model_id=gpt-5.6-luna`,
  `model_display_name=GPT-5.6 Luna`, `mode=real`. `OPENAI_API_KEY` was absent;
  the safe settings mapper returns provider/model, language, mode, status, and
  version metadata, not a credential. Configured state is false with the key
  absent; the live endpoint could not be called. No credential-like columns or
  API-key-like text were found in the AI settings/log inspection. Both
  `ai_request_logs` and `ai_rate_versions` contained 0 rows, so there are no
  historical Anthropic log/rate rows available to compare.
- `npm run ai:seed`: **FAIL / environment-blocked** before database access
  (P1001). A subsequent read-only database query still showed the canonical
  OpenAI/GPT-5.6 Luna settings; the seed itself was not exercised.
- Database-backed regressions all failed during PostgreSQL connection setup:
  `test:ai` 0 passed / 8 skipped; `test:adapt` 0 / 6 skipped;
  `test:brand` 0 / 6 skipped; `test:review` 0 / 4 skipped;
  `test:scheduling` 0 / 8 skipped. `REQUIRE_DATABASE=1 npm run test:unit`:
  **FAIL / environment-blocked**, 24 passed, 67 skipped, 1 database test
  failed; 11 test files reported database connection failures. These results
  do not establish M2/M3/M4 workflow regression behavior against PostgreSQL.
- Focused adapter/config/app checks:
  `npx vitest run tests/openai.test.ts tests/config.test.ts tests/app.test.ts`:
  **PASS**, 3 files / 24 tests (14 adapter, 5 config, 5 app). Adapter coverage
  verifies the Responses API, strict Structured Outputs and exact M2/M3/M4
  schemas, usage and request-ID mapping, `maxRetries=0`, `store=false`, timeout,
  429, authentication, connection and 5xx normalization, and refusal,
  incomplete, empty, invalid-JSON and non-object output handling.
- Frontend: installed Node 22.11.0 is below Vite 8's Node 22.12+ requirement.
  The frontend checks were therefore run on installed Node `v20.20.2` / npm
  `10.8.2`, which satisfies Vite's Node 20.19+ supported line:
  `npm run test` **PASS**, 11 files / 23 tests; `npm run build` **PASS**.
  The frontend source contains no current Claude/Anthropic provider label.
- Missing-key HTTP and live Settings UI smoke: **BLOCKED / not verified**.
  The real server was started with `OPENAI_API_KEY` explicitly unset and
  `OPENAI_MODEL=gpt-5.6-luna`, but app initialization stopped at Prisma P1001
  before HTTP routes could serve `/api/health/live`, authenticated settings,
  or M2 Generate. Thus `503 AI_NOT_CONFIGURED` was not observed in this run;
  the live UI state could not be checked. No runtime FakeAiProvider was used.
- Real OpenAI API commissioning: **DEFERRED — NOT CONFIGURED**. Provider
  readiness remains **BLOCKED** pending database-backed regressions and the
  real missing-key HTTP/settings smoke in an environment where the backend can
  reach PostgreSQL.

Official API references: [Responses API create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
and [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

## OpenAI Provider Commissioning

- Verification date: 2026-09-18. Runtime database: `shifd_marketing_dev`.
- One development-only commissioning campaign was used. Idea ID:
  `43022a1a-173f-400f-93fd-46a3ee472e1d`. Content ID:
  `f681b5ef-df9e-4846-ae59-0c4751d5d019`.
- The real frontend/backend flow completed M2 generation, M3 Instagram
  adaptation, M3 LinkedIn adaptation, M4 Instagram brand check, and M4
  LinkedIn brand check. Exactly five successful OpenAI request logs were
  recorded; no image generation was used and no duplicate provider execution
  was observed.
- Provider metadata for all five requests was `openai` / `gpt-5.6-luna` / mode
  `real` / status `success`. Each recorded a non-empty input hash, input and
  output token usage, latency, and provider request ID. The five calls used:
  M2 `1701` input / `364` output tokens; M3 Instagram `2012` / `277`; M3
  LinkedIn `2012` / `286`; M4 Instagram `2490` / `221`; M4 LinkedIn `2498` /
  `184`. Total: `10713` input / `1332` output tokens. No verified OpenAI
  application rate version was present, so application cost was not invented.
- The single uploaded PNG was attached to Instagram and reused by LinkedIn.
  Both seven-dimension brand assessments were current and aligned. Human
  review and approval completed; the approved-content edit probe returned the
  expected `409 REVIEW_LOCKED` response with Request Revision guidance.
- Both variants were scheduled in `Asia/Jakarta`. Instagram was manually
  published first while the campaign remained `Scheduled`; LinkedIn was then
  published, producing two PublicationRecords and the final `Published`
  lifecycle. Calendar, Performance, Overview, and authenticated refresh were
  verified through the real frontend.
- The local OpenAI key remained server-side. It was not placed in source,
  tracked files, frontend/backend response mappings, PostgreSQL, request
  snapshots, or logs. No credential, session, CSRF, or authorization value was
  included in this record. The existing Responses request continues to use
  `store:false` and the existing client retry policy remains `maxRetries:0`.
- No backend or frontend source change was required during commissioning.
  The only documentation change is this evidence record; the commissioning
  records remain development-only and must not be copied into a formal
  research database.
