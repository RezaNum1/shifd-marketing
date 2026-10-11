# Prospect and outbound extension

## Scope

This extension adds prospect organizations as supporting business data for Shifd Marketing's existing marketing execution application. Phase 01 implements prospect management and Excel prospect import. Phase 02 adds user-triggered source-backed company research and human claim review. Phase 03 adds manual and AI-assisted personalized email drafting. These phases do not change Shifd Labs Company Context or Product Context. Email drafting does not send email or record outbound activity.

## Phase 01 architecture (implemented)

The backend remains a modular Fastify monolith. `modules/prospects` owns validation, persistence workflows, Excel parsing, duplicate review, and authenticated routes. Prisma stores prospects in a new table owned by the authenticated workspace's existing `Company` record. The company relation here represents tenant ownership; each `Prospect` is a target organization and is not a second editable Company Context. A User relation records who created the row. No contact submodel is introduced: Phase 01 supports one available contact name/email/phone on each organization, with all contact fields optional.

Prospect industry is freeform text with bounded length rather than a small enum, so imported sectors remain representable. `status` describes the organization relationship (`lead`, `qualified`, `customer`, `disqualified`); it is not an email or outreach activity status. `source` is `manual` or `excel_import`. Facts supplied by users remain user supplied; this phase does not independently verify them. `version` and ETags protect edits from stale writes. Archive records `archived_at`, and reads remain company-scoped.

### Entity relationship

```text
Company (existing Shifd workspace tenant)
  └── Prospect (target organization; many per workspace)
        ├── createdBy → User (provenance)
        └── optional importBatch → ProspectImportBatch (short-lived, company-scoped review state)
```

The additive migrations add `prospects` and `prospect_import_batches`, their ownership/provenance foreign keys, status/source/count/name checks, normalized name/domain and import-fingerprint identifiers, and company-scoped indexes. The second migration backfills normalized names for any prospects created after the initial migration and adds uniqueness protections. Neither migration drops/truncates tables or changes the existing Company/Product context.

### API changes (implemented)

All endpoints use the existing session authentication. Mutations require the existing allowed Origin and CSRF checks. IDs are looked up together with authenticated `companyId`; a record in another workspace returns not found.

| Method and path | Purpose |
| --- | --- |
| `POST /api/prospects` | Create a manual prospect |
| `GET /api/prospects` | Paginated list; `page`, `limit`, `search`, `industry`, `status`, `archived` filters |
| `GET /api/prospects/:id` | Read a company-scoped prospect |
| `PUT /api/prospects/:id` | Update with `If-Match` version |
| `POST /api/prospects/:id/archive` | Soft archive with `If-Match` version |
| `POST /api/prospects/import/preview` | Parse and validate an uploaded workbook, returning an expiring company-scoped preview token without creating prospects |
| `POST /api/prospects/import/confirm` | Revalidate and create selected valid or explicitly approved ambiguous rows transactionally |

Responses follow the existing `{ data, page? }` and `{ error }` envelopes. Errors avoid returning database diagnostics or contact data in logs.

## Excel import contract (implemented)

The multipart preview endpoint accepts one `.xlsx` file up to the configured `ASSET_MAX_BYTES` limit (10 MiB by default), at most 1,000 ZIP entries and 50 MiB expanded workbook data, and at most 5,000 data rows and 100 columns in the first worksheet. ExcelJS parses the workbook server-side; the application does not execute formulas or macros. Formula cells are rejected at row level. Common English and Indonesian aliases are mapped for company name, industry/sector, website/domain, address, employee count/size, contact name, email, phone, and notes. Users can adjust a column-to-field mapping and request a fresh preview. An unmapped company-name field remains a visible row validation issue. Website values without a scheme are normalized to HTTPS. Employee counts, contact email, and website shape are validated.

Preview returns the source row number, mapped fields, row errors, and potential matches found by normalized company name or website/domain. It writes no prospect records. Preview state is stored separately with a SHA-256 token hash, expires after 30 minutes, is scoped to the authenticated company, and is discarded after confirmation; expired previews are cleaned on a later preview. The UI distinguishes valid, invalid, duplicate and ambiguous rows. Exact domain/import-row repeats cannot be selected. Ambiguous name matches can only be imported after explicit human selection as a separate organization. The user can select valid rows individually. Confirmation accepts only selected row numbers, revalidates fields and duplicate state inside a transaction, and reports imported, skipped and rejection counts. A company-scoped PostgreSQL advisory transaction lock serializes prospect creates/import confirmations; unique indexes provide a second guard for active domains and stable import row fingerprints. Re-importing the same file is detected as duplicate and creates no additional prospect. Existing manually edited prospect data is never merged or overwritten. Invalid-row explanations stay in the preview so the user can correct the source workbook.

### Header aliases

Company name: `company`, `company name`, `organization`, `organisation`, `business name`, `prospect`, `name`, `nama perusahaan`, `nama usaha`. Indonesian aliases include `bidang usaha`/`sektor` (industry), `situs web` (website), `alamat` (address), `jumlah karyawan`/`jumlah pegawai` (employee count), `ukuran perusahaan` (size), `nama narahubung` (contact), `surel` (email), `nomor telepon` (phone), and `catatan`/`keterangan` (notes). English aliases include `sector`, `vertical`, `web site`, `url`, `headcount`, `staff size`, `PIC`, `person in charge`, `e mail`, `mobile`, and `remarks`. Explicit mapping takes precedence over auto-detection and cannot map one worksheet column to multiple fields.

## Phase 02 architecture (implemented)

Prospect research lives in the existing `modules/prospects` domain and extends the existing OpenAI provider's web-search path. It uses OpenAI Responses web search, with medium search scope, a bounded 4,096-token output maximum, the configured AI timeout, no retries, and `store: false`. Only explicit user requests start a run. The search receives prospect name, website, industry, and location/address. It does not receive contact details or prospect notes. External page content is treated as untrusted data by the versioned server prompt.

Prompt reference `m2.prospect_research.v1` is registered through the existing immutable PromptVersion seed convention. Each run also creates an `AiRequestLog` entry with provider/model, input hash/snapshot, token usage, latency, provider request ID, and error status. Estimated cost uses the existing ledger field and remains null when no applicable rate is available; token usage remains visible in research detail and the existing AI usage ledger.

### Evidence and claim model

```text
Company → Prospect → ProspectResearchRun → ProspectResearchSource
                                      └── ProspectResearchClaim ↔ ClaimSource ↔ Source
```

Runs preserve prompt version, tenant, prospect, creator, identity match status/explanation, summary, limitations, and retrieval timestamp. Sources store only provider-returned URLs and metadata, publisher/domain, retrieval time, source type, and availability; publication dates and page bodies are not stored. A source is marked official only when its hostname matches the prospect's supplied website hostname or a subdomain. Other sources are external.

Facts are retained only when at least one normalized HTTP(S) URL from the AI response exactly matches a URL returned in provider search evidence. Unsupported claims are discarded. Invalid, credential-bearing, localhost, private-network, and non-web URLs are rejected. The backend creates claim-source joins only from this validated mapping. This prevents fabricated URL references and unsupported claims from entering the fact list; it cannot independently certify that a linked page substantively proves the AI's wording, so human review remains necessary.

Facts and hypotheses are separate claim types. Hypotheses have the prominent “Potential Opportunity — Not a Confirmed Company Problem” label and are never represented as company facts. Claim review stores approval/rejection, reviewer, timestamp, and note. Approval records that the user reviewed the claim; it does not prove objective truth. Rejected or pending facts are not approved outreach inputs. Phase 03 consumes approved sourced facts and evidence links explicitly; hypotheses are never included in the factual prompt context.

### Human workflow and APIs

Open a prospect and select **Research Company**. The application creates a new append-only run; prior runs and their review evidence remain available. Concurrent runs for a prospect are serialized with a row lock. Users can inspect identity uncertainty, summaries, claims, source links and retrieval dates; approve or reject claims with notes; and revisit prior runs. The feature does not edit manually entered prospect fields or send messages.

All routes use session authentication, CSRF and allowed-origin checks for mutations, UUID validation, and authenticated-company scoping. Detail routes also verify that the requested run/claim belongs to the prospect in the URL.

| Method and path | Purpose |
| --- | --- |
| `POST /api/prospects/:id/research` | Start explicit research; rejects a concurrent run |
| `GET /api/prospects/:id/research-runs` | List up to 30 recent runs |
| `GET /api/prospects/:id/research-runs/:runId` | Read a run, claims, validated evidence, and usage |
| `PUT /api/prospects/:id/research-claims/:claimId/review` | Save approved/rejected review and optional note |

Provider errors are converted to the existing API error envelope and persisted as failed run/usage records. There is no direct URL fetcher, so the application does not fetch arbitrary or internal URLs.

### Limitations

- Identity matching and source-to-claim relevance are AI-assisted and require user inspection; domain matching is a helpful signal, not legal entity resolution.
- Search sources are provider evidence, not a guarantee that the page remains available or proves each claim. Retrieval timestamps are distinct from publication dates, which are intentionally not stored.
- Cost estimation is unavailable when the configured model has no matching cost rate; token usage is still logged.
- Research is a synchronous request and subject to the configured provider timeout. A process interruption can leave a pending run for operator recovery.
- Research does not automatically feed any current generation prompt. Phase 03 must consume approved facts and their evidence explicitly.

## Phase 03 architecture (implemented)

Manual and AI-assisted drafts extend the existing authenticated Prospect Detail workflow. Draft records are stored in `prospect_email_drafts`, tenant-owned, associated with one prospect and the user who created them. The draft stores subject/body, recipient name/email snapshot, language, tone, objective, selected Shifd Labs offering, manual/AI origin, draft/archive status, timestamps and version. A prospect has one optional contact in the current data model, so recipient selection uses that saved prospect contact or no recipient; a separate multi-contact entity is not introduced.

`prospect_email_draft_claims` links a saved AI draft to the selected research claims. Claim review metadata and source URLs remain in the research tables and are returned with the draft for traceability. An AI draft also references its successful `AiRequestLog`, which stores provider/model, versioned prompt ID, input hash/snapshot, token usage, estimated cost when a rate is configured, latency and request ID. The output is not persisted as a draft until the user selects Save. Draft creation and editing never modify Prospect fields. Drafts are archived rather than physically deleted.

The versioned `m2.prospect_email_draft.v1` prompt uses the existing OpenAI provider and strict structured output. It receives the minimum prospect profile context, selected Shifd Labs offering, objective, tone, language, optional guidance, and only the user-selected facts that the server revalidates as approved `sourced_fact` claims with evidence from a matched research run for the same tenant and prospect. Identity-uncertain research and hypotheses are excluded. Source references accompany facts in the internal UI, not as inserted citation markers in the email. Without approved facts the system can draft a generic prospect-aware introduction using the saved profile; it must not invent company facts. Output is bounded to 1,800 tokens and parsed/length-checked before use. Generation is user-triggered and rate-limited. Provider calls and failures use the existing AI usage log and model-rate ledger.

The additive migration creates draft and claim-reference tables, extends both prompt and AI request operation CHECK constraints with `prospect.outreach.email_draft`, and preserves the existing allowlists. Prompt seeding is idempotent and follows the immutable prompt-version convention.

| Method and path | Purpose |
| --- | --- |
| `GET /api/prospects/:id/outreach-facts` | List approved, sourced facts eligible for this prospect |
| `GET /api/prospects/:id/outreach-drafts` | List up to 50 active drafts |
| `POST /api/prospects/:id/outreach-drafts/generate` | Generate an editable AI result; does not save a draft |
| `POST /api/prospects/:id/outreach-drafts` | Save a manual draft or a generated AI result |
| `GET /api/prospects/:id/outreach-drafts/:draftId` | Read saved draft and evidence references |
| `PUT /api/prospects/:id/outreach-drafts/:draftId` | Edit subject/body/recipient on an active draft |
| `POST /api/prospects/:id/outreach-drafts/:draftId/archive` | Preserve and archive a draft |

All endpoints require session authentication and company-scoped lookups. Mutations enforce allowed Origin and CSRF. Composite database keys bind drafts to the same tenant as their prospect and creator. AI saves must reference the authenticated user's successful generation log, its prospect, and exactly the claims selected for that generation. Claim IDs are revalidated as approved sourced facts with source relationships at generation and save time.

The Prospect Detail Outreach section supports saved-draft selection, manual creation, AI generation, editing, saving, copy-subject/body/full-email actions, source review and archive. Copying is a manual handoff to an external email client. There is no SMTP/Gmail/Outlook integration, delivery tracking, sending, or outbound activity history. Those features belong to later phases.

### Phase 03 test commands

From `backend/`, run `npx vitest run tests/prospect-outreach.unit.test.ts tests/prospect-research.unit.test.ts tests/prompt-seed.unit.test.ts` for focused unit coverage. Run `npm run test:prospects` for the authenticated research/outreach API integration fixture; its database guard requires `TEST_DATABASE_URL` to be set and different from `DATABASE_URL`, and the configured target must be `shifd_marketing_test`. From `frontend/`, run `npx vitest run --config vitest.config.ts src/views/ProspectDetailView.spec.ts` and `npm run build`.

## Phase 04 architecture (implemented)

`outbound_activities` is the single tenant-owned event and follow-up table. It stores the prospect, optional same-company email draft, activity type/status, event/due/completion timestamps, contact snapshot, subject/description, reply classification, notes, explicit provenance, creator/updater/archiver and archive timestamps. Composite foreign keys bind rows to the owning company, prospect, users and optional draft. Database CHECK constraints enforce allowed type/status/provenance/classification values and valid field combinations. Activities are archived rather than physically deleted.

Activity types are `email_sent`, `follow_up`, `reply_received`, `meeting`, `product_demonstration`, and `other`. A planned follow-up starts pending with a due date and no occurred date. Completing it records the completion timestamp as its occurrence; cancelling it preserves the due date and does not count it as completed. Scheduled meetings and demonstrations can be completed or cancelled. Replies have a separate classification (`interested`, `not_interested`, `requested_information`, `follow_up_requested`, `meeting_requested`, or `other`) and do not change prospect lifecycle status.

Provenance is explicitly selected as `historical`, `artifact_assisted`, or `non_artifact_assisted`; it is not inferred from the record-entry date or linked draft. `occurredAt` is distinct from `createdAt`, so historical events entered during the four-week field evaluation remain measurable by their actual event time. Evaluation boundaries are not hardcoded. The model supports later filtering by event date and provenance, but this phase adds no evaluation dashboard and keeps inbound inquiry metrics separate.

Email drafts remain drafts until a user manually sends outside the application and explicitly records an `email_sent` activity. The activity can reference an active saved draft or be recorded without one. Recording does not verify delivery and never changes or archives the draft. The current prospect schema has one saved contact, so activities preserve that contact as a name/email snapshot; multi-contact management is not included.

| Method and path | Purpose |
| --- | --- |
| `POST /api/prospects/:id/outbound-activities` | Record an event or schedule a follow-up |
| `GET /api/prospects/:id/outbound-activities` | List chronological activities with bounded pagination |
| `GET /api/prospects/:id/outbound-activities/:activityId` | Read an activity |
| `PUT /api/prospects/:id/outbound-activities/:activityId` | Edit event details and notes |
| `POST /api/prospects/:id/outbound-activities/:activityId/complete` | Complete a pending follow-up or scheduled meeting/demo |
| `POST /api/prospects/:id/outbound-activities/:activityId/cancel` | Cancel a pending follow-up or scheduled meeting/demo |
| `POST /api/prospects/:id/outbound-activities/:activityId/archive` | Archive an activity with actor/time metadata |
| `GET /api/prospects/:id/outbound-activities/summary` | Calculate counts and last interaction from persisted, non-archived events |

All endpoints require authentication; mutations also validate Origin and CSRF. Tenant, prospect, contact snapshot and linked draft checks are server-side. Timeline entries show event/due time separately from record time and show the recording user. Summary counts use persisted rows only.

### Phase 04 testing

From `backend/`, run `npx vitest run tests/prospect-activities.unit.test.ts tests/prospect-outreach.unit.test.ts tests/prospect-research.unit.test.ts` for focused unit checks. Run `npm run test:prospects` for the database-backed prospect, research, draft and outbound-activity API integration suite. From `frontend/`, run `npx vitest run --config vitest.config.ts src/views/ProspectDetailView.spec.ts`. Apply migrations and run integration tests only against `shifd_marketing_test`.

## Relationship to existing six modules

Prospects are a supporting business-data capability. The existing six marketing modules and their Company/Product contexts, content and ideas, calendar, Telegram, AI, and performance flows remain separate and unchanged. This phase adds no prospect foreign keys to those existing records and does not feed prospect facts into prompts. Later phases can associate evidence and outbound artifacts without copying or changing current Company/Product context.

## Phased development plan

| Phase | Planned capability | Status |
| --- | --- | --- |
| 01 | Prospect create/list/search/filter/detail/edit/archive and Excel preview/confirm import | Implemented in this change |
| 02 | AI-assisted prospect research with source-backed evidence and explicit human review | Implemented in this change |
| 03 | Personalized outbound email drafts linked to prospects and evidence | Implemented |
| 04 | Outbound communication activity history, replies, follow-ups and meetings | Implemented |
| 05 | Industry-based content generation and planning | Future; not implemented |
| 06 | Optional prospect-linked campaign and content-calendar associations | Future; not implemented |
| 07 | Separate inbound/outbound performance metrics and enhanced evaluation dashboard | Future; not implemented |

The order and boundaries of future phases remain subject to evaluation and thesis supervision. Phase 05 and later workflows are not present in the current UI or API.

## Phase 01 limitations

- One contact per organization; multiple contacts and contact-specific history are deferred.
- Industry is free text; there is no canonical sector taxonomy or normalization across synonyms.
- Duplicate detection is a review aid based on normalized name/domain, not a legal-entity resolution system. Matches are not merged.
- Import preview state is temporary review metadata and contains user-supplied contact/company fields until confirmation or expiry; it is company-scoped, token-protected and expiring, but is not an audit archive of the original workbook.
- The importer reads the first worksheet only and does not preserve workbook formatting or formulas.
- There is no restore action in this phase, though archived records remain in storage and can be queried with `archived=true`.
- No imported company facts are researched or verified by the application.
- Phase 02 source and claim validation verifies exact provenance references and safe URL shape, but does not independently audit page content or resolve corporate identity.

## Four-week research-evaluation considerations

Use `shifd_marketing_test` for automated database integration tests and synthetic workbook fixtures. Never seed or fabricate prospect rows in development, research, or production. During the four-week field evaluation, identify user-supplied/imported records through `source`, preserve creation/update timestamps and creator provenance, and document the participant's source spreadsheet and manual corrections in the research protocol rather than treating spreadsheet facts as verified evidence. Freeze a data dictionary and status definitions before collection; keep prospect status distinct from future outbound activity outcomes. Do not backdate records or alter existing research KPIs. Analyze counts and workflow observations at the approved company/participant scope, and avoid exposing contact details in reports. Record usability feedback and import error categories separately from downstream outcome measures. This phase alone cannot measure research accuracy, outbound effectiveness, or content impact.

## Validation evidence

Phase 03 checks run in the Codex workspace:

- Draft/parser and prompt registry focused unit tests: 9 passed.
- Prospect Detail targeted component tests: 9 passed, including manual save without research context, AI generation/edit/save with source references, draft reopening, and clipboard actions.
- Prisma schema validation and client generation passed.
- Backend TypeScript build and frontend type-check/production build passed.
- The guarded migration plus `npm run test:prospects` could not connect to PostgreSQL (`P1001`, `127.0.0.1:5432`) while targeting only `shifd_marketing_test`; the migration and API/database assertions remain unverified here.
- For local DB verification from `backend/`, run the guarded migration below, followed by `npm run test:prospects`:

```sh
node -r dotenv/config -e 'const { spawnSync } = require("node:child_process"); const url = process.env.TEST_DATABASE_URL; if (!url || new URL(url).pathname.slice(1) !== "shifd_marketing_test" || url === process.env.DATABASE_URL) throw new Error("Refusing migration outside shifd_marketing_test."); const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } }); process.exit(result.status ?? 1);'
npm run test:prospects
```

Phase 04 focused checks in the Codex workspace:

- Outbound activity, outreach draft and research unit tests: 12 passed.
- Prospect Detail targeted tests: 12 passed, including recording a draft-linked sent email, follow-up scheduling/completion, timeline and persisted summary rendering, and activity loading errors.
- Prisma schema validation/client generation, backend TypeScript build, frontend type-check/production build, and `git diff --check` passed.
- The guarded Phase 04 migration attempt was blocked by PostgreSQL `P1001` at `127.0.0.1:5432` while the URL selected `shifd_marketing_test`. The database-backed activity/API assertions were not run and are not reported as passed.
- After local PostgreSQL is available, from `backend/` apply the additive migration and run the targeted prospect/research/outreach/activity integration suite with:

```sh
node -r dotenv/config -e 'const { spawnSync } = require("node:child_process"); const url = process.env.TEST_DATABASE_URL; if (!url || url === process.env.DATABASE_URL) throw new Error("Refusing migration: TEST_DATABASE_URL must be set and distinct from DATABASE_URL."); let parsed; try { parsed = new URL(url); } catch { throw new Error("Refusing migration: TEST_DATABASE_URL is invalid."); } if (parsed.pathname.replace(/^\//, "") !== "shifd_marketing_test") throw new Error("Refusing migration outside shifd_marketing_test."); const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } }); process.exit(result.status ?? 1);' && npm run test:prospects
```

Phase 02 checks run in the Codex workspace:

- Prospect research/parser and existing OpenAI, topic discovery, and Prospect focused tests: 54 passed.
- Prospect detail view targeted tests: 5 passed.
- Prisma schema validation, Prisma client generation, backend TypeScript build, and frontend production build passed.
- Database migration and research/prospect API integration checks are blocked in the sandbox: `shifd_marketing_test` is configured, but PostgreSQL at `127.0.0.1:5432` returned Prisma `P1001`. No attempt was made against another database.
- After local PostgreSQL is available, from `backend/` run this guarded migration plus integration command. It refuses to migrate unless the database path is exactly `shifd_marketing_test`:

```sh
node -r dotenv/config -e 'const { spawnSync } = require("node:child_process"); const url = process.env.TEST_DATABASE_URL; if (!url || new URL(url).pathname.slice(1) !== "shifd_marketing_test") throw new Error("Refusing migration outside shifd_marketing_test."); const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } }); process.exit(result.status ?? 1);' && npm run test:prospects
```

Validation evidence for Phase 01 (historical):

- Backend unit/regression suite: 79 passed in the final local agent run; database-only suites are skipped by this unit command.
- Prospect integration (`npm run test:prospects`): passed on the user's local Mac with PostgreSQL available (user-confirmed); the Codex sandbox did not execute these database assertions.
- Frontend unit suite: 32 passed.
- Backend build and Prisma schema validation: passed.
- Frontend type-check and production build: passed.
- The Prospect integration cases cover CRUD/search/filter/pagination and tenant scoping; preview non-mutation, import confirmation, duplicate/reimport and concurrent confirmation; and archive retention/default exclusion.

Skipped database assertions are not counted as unit-test passes; the integration result above is separately attributed to the user's local run.
