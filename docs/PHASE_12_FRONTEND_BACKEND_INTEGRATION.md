# Phase 12 — Frontend ↔ Backend Integration & Artifact Completion

Status: implementation complete; real runtime smoke and regression gates
executed on 2026-09-14.
PHASE 12 IMPLEMENTATION READINESS: **READY TO LOCK**
ANTHROPIC PROVIDER COMMISSIONING: **DEFERRED — NOT CONFIGURED**
FORMAL THESIS EVALUATION READINESS: **BLOCKED** until Anthropic provider
commissioning is completed.
No Phase 12 tag has been created.

Phase 12 connects the locked `frontend-v1` Vue application to the completed
Phase 1–11 backend. The frontend visual hierarchy, terminology, sidebar,
stepper, route structure, and thesis workflow remain intact. No new product
feature or backend domain phase was added.

## API client architecture

The frontend now has one small shared HTTP client at
`frontend/src/api/client.ts`, with domain adapters kept separate by concern:

- `auth.ts` — login, session bootstrap, and logout;
- `context.ts` — company context, resolved product context, products, and
  taxonomy;
- `ideas.ts` — idea list and lifecycle commands;
- `content.ts` — Content reads, editorial updates, AI commands, brand checks,
  review actions, and lifecycle commands;
- `assets.ts` — private PNG/JPEG upload, variant attachment, and LinkedIn
  creative reuse;
- `scheduling.ts` — calendar, schedule mutations, and manual publication;
- `performance.ts` — reports, overview, publications, and manual metric
  observations;
- `integrations.ts` and `settings.ts` — safe integration and AI/system
  settings reads and approved mutations.

The client supports configurable `VITE_API_BASE_URL`, same-origin relative
URLs, `credentials: include`, JSON envelopes, multipart requests, request IDs,
CSRF headers, `If-Match`, ETag extraction, and `Idempotency-Key`. Response
errors are normalized to `ApiError` with status, safe backend code/message,
fields, and request ID. Raw server stack traces are not shown to users.

## Authentication, session, and CSRF

`POST /api/auth/login` and `GET /api/auth/me` populate the runtime auth store
and capture the CSRF token returned by the backend. `POST /api/auth/logout`
clears it. The browser owns the HttpOnly session cookie; the frontend does not
store or create JWTs and does not persist session credentials or CSRF values to
localStorage.

The router bootstraps `/api/auth/me` before resolving protected routes. An
unauthenticated user is redirected to `/login`, with the existing redirect
intent preserved. An authenticated user visiting `/login` is redirected to
`/`. Mutation requests attach `X-CSRF-Token` and rely on the browser's natural
`Origin` header. GET requests do not need a CSRF header.

Known backend errors retain their domain meaning:

- `412 REVISION_CONFLICT` refreshes the canonical resource and asks the user
  to review the latest state;
- `409 REVIEW_LOCKED` directs the user to Request Revision;
- `409 INPUT_CHANGED` asks for an intentional regeneration;
- `503 INTEGRATION_NOT_CONFIGURED` is rendered as an unavailable/unconfigured
  integration state;
- authentication, validation, media-type, rate-limit, and server errors use
  reusable safe messages.

## ETag and idempotency strategy

Canonical Content, Idea, Product, Company Context, integration, AI settings,
and metric records retain the backend version/ETag in their Pinia store. Content
mutations send the latest `If-Match` value and replace the store with the
canonical response and returned ETag/version after success. A `412` is never
retried or overwritten blindly: the latest resource is fetched and the stale
edit is surfaced to the user.

Intentional creation/command operations use a runtime idempotency registry.
The same key is retained for a retry of the same logical action and a new key
is created for a new action. Successful commands and known invalidated
commands are cleared. This covers Content and Idea creation, duplication,
AI generation/adaptation/brand-check/review commands, creative and metric
evidence uploads, schedule creation, and manual publication where the backend
contract requires idempotency.

## Pinia migration from fixtures

Canonical business state no longer comes from the old local fixture modules.
The stores now use API reads and writes for persisted data while retaining only
UI state, loading/error state, form drafts, selected filters, and local
workflow-step navigation. The files under `frontend/src/data/` remain isolated
compatibility/test fixtures and are not imported by runtime stores or views as
canonical data. No localStorage/sessionStorage persistence was introduced.

The workflow step is deliberately local. Resume position is derived from the
backend Content lifecycle:

| Backend lifecycle | Frontend resume |
| --- | --- |
| Draft | Brief |
| Generated | Generate |
| Adapted | Adapt |
| Creative In Progress | Creative |
| Ready for Review | Review |
| Needs Revision | Review |
| Approved | Schedule |
| Scheduled | Schedule |
| Published | Content detail |
| Archived | Content detail |

## Route and domain integration

The locked routes are preserved:

- `/login` and `/` use the auth/session bootstrap and backend Overview;
- `/content/ideas` uses backend idea list/create/update/archive/restore/
  duplicate operations. Opening Create from an Idea only prefills a local
  Brief; the Idea becomes Used through successful backend Content creation;
- `/content/create` creates the canonical Content at the explicit Brief
  boundary, then uses backend Generate, Adapt, private asset upload/attachment,
  Brand Check, Human Review, approval, and scheduling commands;
- `/content/library` and `/content` read backend Content summaries;
- `/content/:id` reads canonical Content, events, and review actions and
  exposes Request Revision for approved/scheduled content;
- `/calendar` reads backend-derived scheduled, ready-to-publish, and published
  entries and uses the manual publication endpoint;
- `/performance` and the existing LinkedIn metrics screen use backend
  performance/reporting and metric APIs;
- `/context/company` loads and saves company profile, brand profile, BMC
  blocks, and context version;
- `/context/products` and product detail use backend product list/detail/create/
  update and resolved product context APIs, preserving incomplete products;
- `/settings/integrations` reflects backend mode/status and approved Instagram
  boundary commands without exposing credential references;
- `/settings/ai` reads safe AI/system settings, prompt history, request logs,
  and usage data only when returned by the backend contract.

The scheduling adapter implements the existing POST, single-row PUT, and
DELETE schedule contracts with the parent Content ETag. The locked v1
schedule surface only exposed batch scheduling and manual publication, so no
new reschedule/cancel controls were added to the visual artifact; Request
Revision continues to use the backend review command, which cancels active
unpublished schedules as part of that existing workflow.

Content adaptations are sent independently for Instagram and LinkedIn. Brand
assessment displays the backend score, state, recommendation, and checks for
text/context consistency. It does not claim that the image was AI-reviewed and
does not convert an aligned assessment directly into approval. The exact
five-item human approval checklist remains in the UI, while the backend is
authoritative for approval and review locks. Published variants are not edited
destructively; the existing replacement path is duplicate Content.

Creative uploads accept only PNG and JPEG files. Asset reads remain private
through authenticated backend content URLs. LinkedIn can use its own asset or
the backend's Instagram creative-reuse command. No SVG, Canva API, image
generation, auto-posting, or provider credential flow was added.

Calendar boundaries and schedule payloads use `Asia/Jakarta` in the artifact
UI. Publication is always explicit: elapsed schedule time only changes the
backend-derived display state after a read; it never creates a local or
automatic publication record.

Performance and Overview render backend-calculated values directly. Reach and
zero-impression engagement rate remain unavailable when the backend returns
`null`. The UI uses “Combined Platform Reach,” “Platform Metrics for
Publication Week,” and “Supplementary Inquiry Volume” within the existing
locked layout, and does not add unique reach, brand awareness, causal AI
recommendations, or post-level metric attribution.

## Loading, empty, and error states

Primary API-backed pages now distinguish loading, empty, success, and known
error states. Examples include no ideas, products, Content, schedules,
publications, or metrics. Forms and detail pages wait for canonical reads before
showing editable state, preventing fixture data or a transient blank/not-found
state from being used as a fallback. Retry and navigation actions use the
existing UI patterns and toast/inline-alert components.

## Development and environment configuration

`frontend/.env.example` documents the only public frontend variables:

```sh
VITE_API_BASE_URL=/api
VITE_DEV_BACKEND_URL=http://127.0.0.1:3000
```

Vite proxies `/api` to `VITE_DEV_BACKEND_URL` during development and preserves
the backend's Origin policy. Production remains same-origin behind a reverse
proxy. No secret, provider API key, credential reference, or server environment
variable is exposed through `VITE_*`.

## Tests and verification executed

Frontend dependencies were installed with `npm ci`. The current environment
reported npm engine warnings because it runs Node `20.20.2` while some installed
tooling declares a newer supported range; installation completed successfully.

Executed frontend gates:

- `npm run test` — **PASS**, 11 test files and 23 tests;
- `npm run build` — **PASS**, `vue-tsc -b` and the Vite production build;
- standalone `npm run typecheck` — not defined in `frontend/package.json`;
- `npm run lint` — not defined in `frontend/package.json`.

Added adapter/store coverage includes auth CSRF rotation, ETag extraction,
mutation headers, idempotency-key reuse, error-envelope mapping, Content
normalization, lifecycle resume mapping, product context normalization, null
metric handling, and backend engagement/rate preservation. Existing component
and validation tests continue to run in the same suite.

The first local backend build exposed stale generated Prisma client output that
did not contain the already-checked-in Phase 10–11 schema models. Running the
existing `npm run db:generate` refreshed generated client output locally; the
backend build then passed. The backend also received one minimal runtime fix
after the browser smoke proved that PostgreSQL `jsonb` key ordering caused an
unchanged Master/Visual update to be treated as changed. No schema, migration,
API contract, or business rule changed.

The default backend `npm run test:unit` passed with database integration suites
skipped by its default mode. With PostgreSQL available, the complete
database-enabled unit run also passed: 13 files and 78 tests. The required
backend build passed. No migration was applied, reset, or edited.

### Backend regression after JSON fix

- `npm run test:content` — **PASS**, 1 file / 7 tests;
- `npm run test:ai` — **PASS**, 1 file / 8 tests;
- `npm run test:adapt` — **PASS**, 1 file / 6 tests;
- `npm run test:brand` — **PASS**, 1 file / 6 tests;
- `npm run test:review` — **PASS**, 1 file / 4 tests;
- `npm run test:scheduling` — **PASS**, 1 file / 8 tests;
- `REQUIRE_DATABASE=1 npm run test:unit` — **PASS**, 13 files / 78 tests;
- `npm run build` — **PASS**.

The targeted suites executed against the real PostgreSQL database. The AI
tests use their existing test-injected provider doubles only inside the test
harness; no runtime provider was added or configured.

## Final verification evidence

The final runtime verification was executed on 2026-09-14 against the real
Docker PostgreSQL service, the real backend at `127.0.0.1:3000`, and the real
Vite frontend at `http://localhost:5173`. No PostgreSQL reset, migration,
deletion, fake runtime provider, or Phase 12 tag was used.

### Environment and service checks

- `docker info`: **PASS**; Docker Desktop server is running with context
  `desktop-linux`.
- `docker compose ps` from `backend/`: **PASS**; `backend-postgres-1` is
  `postgres:16`, `Up`, and published on `127.0.0.1:5432`.
- `npx prisma migrate status`: **PASS**; 12 migrations found and the database
  schema is up to date.
- Backend `npm run dev`: **PASS**; `/api/health/live` returned HTTP 200.
- Frontend Vite dev command: **PASS**; the browser smoke used the same-origin
  `/api` proxy and `http://localhost:5173` Origin policy.
- `frontend/.env.example`: **PASS**; no server secret or provider credential is
  exposed through `VITE_*`.
- AI settings: provider is `anthropic`, display name `Claude`, mode `real`, but
  `model_id` is empty and `backend/.env` has no `ANTHROPIC_API_KEY` or
  `ANTHROPIC_MODEL`.

### Required final report

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| DOCKER | **PASS** | `docker info` succeeded; Docker Desktop server was reachable. |
| POSTGRESQL | **PASS** | Real `postgres:16` container was up; Prisma reported 12 migrations up to date. |
| BACKEND HTTP | **PASS** | Real backend served `/api/health/live` with HTTP 200. |
| FRONTEND | **PASS** | Real Vite frontend served the browser smoke; final production build passed. |
| BROWSER MECHANISM | **PASS** | Custom Playwright browser smoke completed against the real services. |
| LOGIN | **PASS** | UI login succeeded and the browser received the HttpOnly session cookie. |
| SESSION RESTORE | **PASS** | `/api/auth/me` restored the session; browser storage remained credential-free. |
| CONTEXT | **PASS** | Company context read/save and ETag mutation path succeeded. |
| PRODUCT | **PASS** | Add Product UI returned 201; detail/profile save returned 200 and resolved context. |
| IDEA | **PASS** | Idea creation returned 201 and the source Idea became Used after Content creation. |
| CONTENT BRIEF | **PASS** | UI Content creation returned 201 and the brief persisted. |
| M2 | **DEFERRED — PROVIDER NOT CONFIGURED** | Real generation guard returned 503 `AI_NOT_CONFIGURED`; no runtime fake was added. |
| M3 | **DEFERRED — PROVIDER NOT CONFIGURED** | Real adaptation guard returned 503 `AI_NOT_CONFIGURED`; manual editorial values were used only to continue non-AI UI verification. |
| CREATIVE | **PASS** | Real PNG upload returned 201, private asset access succeeded, attachment and LinkedIn reuse persisted. |
| M4 | **DEFERRED — PROVIDER NOT CONFIGURED** | Both real brand-check guards returned 503 `AI_NOT_CONFIGURED`. |
| HUMAN REVIEW / APPROVAL | **DEFERRED — DEPENDS ON VALID CURRENT M4 EVIDENCE** | Review UI and checklist gate rendered; approval stayed disabled because current M4 evidence was unavailable. No fake assessment or approval was inserted. |
| REVIEW LOCK UX | **PASS (gate)** | The approval control remained disabled without current assessment evidence; an approved-content lock probe was not applicable. |
| SCHEDULING FULL APPROVED FLOW | **DEFERRED — DEPENDS ON APPROVAL** | Real schedule attempt returned 409 for the required human approval prerequisite; no schedule was created. |
| CALENDAR | **PASS** | Real calendar rendered its empty state and the schedule read path succeeded. |
| MANUAL PUBLICATION FULL FLOW | **DEFERRED — DEPENDS ON APPROVED SCHEDULING CHAIN** | Publication feed returned 200 with no records; no approved schedule existed to publish. |
| PUBLISHED LIFECYCLE FULL FLOW | **DEFERRED — DEPENDS ON SAME CHAIN** | Correctly not entered because approval and scheduling depend on M4 evidence. |
| PERFORMANCE | **PASS** | Backend metric/inquiry observations rendered in Performance and LinkedIn Metrics; unavailable reach displayed as `—`. |
| OVERVIEW | **PASS** | Backend-calculated overview sections and snapshot rendered. |
| INTEGRATIONS | **PASS** | Instagram demo connect, sync, and disconnect succeeded; account was left disconnected. |
| AI SYSTEM | **PASS** | UI reported Claude / Not configured from backend settings. |
| LOGOUT | **PASS** | Logout returned 204; subsequent `/api/auth/me` returned 401 and the session cookie was gone. |
| MOCK RUNTIME REMOVAL | **PASS** | The smoke used persisted API state; no runtime fake AI provider was introduced. |
| FRONTEND TESTS | **PASS** | `npm run test`: 11 files / 23 tests. |
| FRONTEND BUILD | **PASS** | `npm run build`: `vue-tsc -b` and Vite production build passed. |
| BACKEND BUILD | **PASS** | Backend `npm run build` passed. |
| PLAYWRIGHT | **PASS (custom smoke)** | Final smoke completed; the legacy deferred `frontend-v1` suite remains stale and was not reclassified as a locked gate. |
| REAL CLAUDE API | **DEFERRED — PROVIDER NOT CONFIGURED** | No intentionally configured Anthropic key/model was present; no paid provider call was made. |
| MIGRATIONS | **PASS / UNCHANGED** | Migration status was up to date; no migration was applied, edited, or reset. |
| SOURCE CHANGES | **MINIMAL RUNTIME FIXES** | Only defects proven by real smoke were corrected; no new phase or feature was started. |

### Final classification

BACKEND REGRESSION AFTER JSON FIX:

- `npm run test:content` — **PASS**;
- `npm run test:ai` — **PASS**;
- `npm run test:adapt` — **PASS**;
- `npm run test:brand` — **PASS**;
- `npm run test:review` — **PASS**;
- `npm run test:scheduling` — **PASS**;
- `npm run test:unit` — **PASS**; 10 non-database tests passed and database
  tests are skipped by the default mode;
- `REQUIRE_DATABASE=1 npm run test:unit` — **PASS**; 13 files / 78 tests;
- `npm run build` — **PASS**.

FRONTEND TESTS: `npm run test` — **PASS**, 11 files / 23 tests.

FRONTEND BUILD: `npm run build` — **PASS**.

NON-AI REAL RUNTIME SMOKE: **PASS**.

ANTHROPIC RUNTIME: **DEFERRED — NOT CONFIGURED**.

M2/M3/M4 REAL PROVIDER SMOKE: **DEFERRED**.

FULL APPROVAL→PUBLICATION SMOKE: **DEFERRED BY AI PREREQUISITE**.

UNRESOLVED FUNCTIONAL BLOCKERS: **None.**

UNRESOLVED ENVIRONMENT BLOCKERS: **None.**

ACCEPTED EXTERNAL LIMITATIONS: **Anthropic provider commissioning**.

### Smoke data, network review, and blockers

SMOKE DATA LEFT: **Yes, intentional.** After the final pass the database held 1
Product, 8 Ideas, 8 Contents, 6 creative Assets, 5 own Variant Asset links, 1
weekly LinkedIn metric, and 1 inquiry observation. The latest smoke Content was
`ready_for_review` with `design_status=ready`, two platform variants, one
Instagram asset, and a persisted LinkedIn reuse relation. There were 0
`approval_actions`, 0 `content_schedules`, and 0 `publication_records`. No
cleanup operation was run.

### Research data hygiene

The current development database contains smoke/test observations, including
manual performance and inquiry records. Before the formal thesis baseline or
evaluation/data collection, these observations must either be excluded through
a documented clean baseline or isolated by using a fresh research/evaluation
database. No delete API should be added merely for cleanup.

BROWSER CONSOLE/NETWORK: **PASS.** The final smoke completed all 15 checkpoints
with no page errors or unexpected Vue warnings. The only recorded response
messages were expected initial/post-logout 401 authentication reads, four
provider-guard 503 responses for M2/M3/M4, and the expected scheduling 409
approval guard.

UNRESOLVED FUNCTIONAL BLOCKERS: **None demonstrated** after the runtime-proven
fixes. Company/product response-only fields, unresolved `BaseTextarea` imports,
the content JSON comparison, pending creative selections, and logout routing
were all corrected and reverified in the real browser path.

UNRESOLVED ENVIRONMENT BLOCKERS: **None.** Docker, PostgreSQL, backend, and
frontend were available for the final smoke.

ACCEPTED EXTERNAL LIMITATIONS: **Anthropic provider commissioning**. The
database is configured for Anthropic/Claude in real mode, but no intentionally
configured runtime key/model exists in `backend/.env`. M2/M3/M4 therefore stay
guarded as `503 AI_NOT_CONFIGURED` and are classified as deferred, not failed.

PHASE 12 IMPLEMENTATION READINESS: **READY TO LOCK**.

ANTHROPIC PROVIDER COMMISSIONING: **DEFERRED — NOT CONFIGURED**.

FORMAL THESIS EVALUATION READINESS: **BLOCKED** until Anthropic provider
commissioning is completed. No Phase 12 tag has been created, and no
additional feature development was started.

## ANTHROPIC PROVIDER COMMISSIONING

This is an accepted external provider limitation and must be completed before
formal thesis evaluation/data collection. When credentials are intentionally
configured later, run this future gate against the real provider:

Brief → M2 Generate → M3 Instagram → M3 LinkedIn → Creative → M4 Instagram →
M4 LinkedIn → Human Review → Approve → Schedule → Manual Publish → Published

No implementation redesign should be required for this future gate.

### Provider security

`ANTHROPIC_API_KEY` must remain server-side. It must never be committed to git,
placed in `VITE_` variables, returned to the frontend, written into Phase
documentation, or printed in smoke reports. The credential will be configured
locally by the user when ready.

## Backend changes

One minimal runtime correction was made in
`backend/src/modules/content/service.ts`: JSON comparison now uses structural,
stable object-key ordering so PostgreSQL `jsonb` persistence does not report an
unchanged Master/Visual payload as changed. No schema, migration, API contract,
or business rule changed.

Runtime-proven frontend corrections were limited to response-only field
stripping, missing `BaseTextarea` imports, preserving pending creative
design/reuse selections across canonical mutations, and awaiting logout before
router navigation. No runtime AI provider or test fake was added.
