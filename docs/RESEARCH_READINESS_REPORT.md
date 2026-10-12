# Phase 08 — Final Integration Validation & Research Readiness

**Recommendation: NOT READY for field deployment yet.** Core builds, frontend tests, Prisma validation, and backend unit tests pass in the Codex environment. Database-backed module scenarios could not run because PostgreSQL at `127.0.0.1:5432` was unreachable from this environment. The full M1–M6 browser workflow and founder UAT are also pending. Do not treat this report as proof that the artifact has completed field validation.

## Repository and Phase Evidence

- The working tree was clean at audit start. Current changes are limited to this Phase 08 validation runner, test-database example configuration, and three research-readiness documents; all remain uncommitted.
- Current `HEAD`: `d741bb8 feat(performance): add four-week marketing evaluation dashboard`.
- Relevant history includes Phase 05 `ad398f2 feat(content): add industry-based content ideation` and Phase 06 `fe7a874 feat(calendar): support industry and prospect-linked content planning`.
- User-confirmed host-Mac evidence: Phase 06 migration and `npm run test:scheduling` passed. User reports Phase 07 validation is resolved and safe. Codex did not independently reproduce either host result in this pass.
- No production, research, or development records were read or changed by this audit. Automated test fixtures are synthetic and guarded to `shifd_marketing_test`.

## Validation Results

The added command is `cd backend && npm run validate:research`. It checks the test database name and separation from `DATABASE_URL`, performs one read-only `SELECT current_database()` connection check, and then runs the available tests/builds. It never applies migrations or writes to production.

| Check | Result in this pass | Evidence |
|---|---|---|
| Backend unit suite | **PASS** — 107 passed | `npm run test:unit`; DB-backed groups were skipped because `REQUIRE_DATABASE` was not enabled after the DB preflight failed. |
| Backend integration | **BLOCKED** — 84 skipped | One DB preflight failed with `PrismaClientInitializationError` at `127.0.0.1:5432`; the runner did not retry. No integration case is claimed as passed by Codex. |
| Frontend unit suite | **PASS** — 48 passed | `frontend npm test`; 17 test files passed. |
| Backend build | **PASS** | `backend npm run build`. |
| Frontend build | **PASS** | `frontend npm run build` (`vue-tsc` and Vite). |
| Prisma schema validation | **PASS** | `npx prisma validate`. This validates the schema, not the live migration state. |
| Migration status | **NOT VERIFIED** | Requires database access. The migration chain is present in Git; Codex did not execute migrations or inspect a database. |
| Browser/manual UAT | **PENDING** | No browser session against an integrated DB-backed app was run. |
| Full end-to-end M1–M6 workflow | **NOT VERIFIED** | There is no single automated test that traverses the full workflow; component/API test coverage is split by module. |
| `git diff --check` | **PASS** | No whitespace errors. |

The Codex sandbox database-connection failure is an environment limitation, not evidence that the host-Mac PostgreSQL result failed. Host-confirmed results above remain attributed to the user and are not represented as Codex command output.

## Integration and Security Review

- **Content execution:** M1 context, M2 ideation, M3 variants, M4 review, M5 calendar, and M6 performance have separate API/UI modules and tests. Cross-module identifiers are content, variant, schedule, and publication IDs. The whole chain remains unverified in one session.
- **Industry/prospect content:** Phase 05 and Phase 06 commits are present. Industry targeting is optional and prospect linkage is nullable in the content/calendar schema. Full company ownership assertions exist in integration tests but were not executed here.
- **Prospect research and outbound:** Research runs, sources/claims, email drafts, and outbound activities are represented separately. Unit tests for claim filtering, editable outreach, and explicit activity provenance passed as part of the backend unit suite. Database/API evidence remains blocked. Drafting and copying are not sent events by design; users must record actual outreach.
- **Human review:** M4 assessment and approval are distinct. Existing review tests exercise advisory output and approval requirements, but DB-backed tests were skipped this pass.
- **Tenant isolation:** Static review found company-scoped query predicates and company-composite relations in the audited context, prospect, content, schedule, inquiry, production-time, and evaluation services. Cross-tenant cases exist in context/prospect/research/scheduling/performance integration tests. These are not declared verified because the current integration suite could not connect.
- **GET behavior:** Existing API tests check read purity for overview/performance/context paths; static review found evaluation GET uses read queries. Not all GET handlers were exhaustively audited.
- **AI governance:** Prompt identity/versioning, request logs, structured output validation, usage metadata, idempotency, and bounded provider calls are represented in the backend. Automated provider tests use fakes/mocks. No paid AI or social API calls were made during this validation.
- **External evidence:** Topic discovery and prospect research retain provider-returned source references and review states. No external source was fetched during this Phase 08 audit.
- **Database integrity:** The schema uses tenant-aware relations and restrictive foreign keys for core research/content/activity records. Migrations are ordered and additive in the checked-in chain. Live migration state, indexes, and existing record quality could not be inspected without DB access; no suspected duplicate business records were deleted.

## Research Measurement Readiness

- The latest configuration supports a local-date evaluation start, 28-day baseline, 28-day intervention, Week 0/Week 4 snapshots, timezone, revision, and definitions. Details are in [FOUR_WEEK_EVALUATION_PROTOCOL.md](FOUR_WEEK_EVALUATION_PROTOCOL.md).
- Posting consistency uses actual publication records and is calculated separately by platform. Scheduled and cancelled records are not publications.
- Production time is manually recorded against content using `occurredAt` and active minutes; the dashboard aggregates by campaign. No historical time is synthesized. The measure is descriptive and does not claim a pre/post efficiency improvement.
- Instagram account observations and post observations are kept separate. LinkedIn engagement rate uses the manually entered native value. The implementation does not create Instagram impressions when unavailable.
- Inbound business inquiries and outbound replies are separate records and KPI groups. Outbound classifications depend on actual recorded activity and provenance.
- KPI output retains source record identifiers and status/availability distinctions. Partial intervention comparisons do not show completed percentage changes; baseline zero produces N/A percentage change.
- No evaluation observations, Week 0/Week 4 values, publication events, inquiries, or outreach records were invented for this report.

## Open Issues by Priority

- **P0:** None demonstrated in this bounded audit.
- **P1:** DB-backed module tests and the full core workflow need a successful host-Mac run. The current Codex DB preflight failed; no critical implementation failure was observed in available tests/builds.
- **P2:** Full browser UAT and an automated cross-module browser test are absent/pending. Test coverage is organized mostly as separate API integration and view/unit tests.
- **P3:** Deployment/monitoring target is not checked into the repository, so production operations cannot be verified here.

## Manual UAT Checklist

Use real approved company data only. Do not send an email or publish a post as part of this checklist unless separately intended.

1. **Context and ideation:** `/context/company` → `/context/products` → `/content/ideas`; verify company/product context and generate a general and an industry-targeted idea with no prospect selected.
2. **Adaptation and review:** Open a saved item at `/content/:id`; create/inspect Instagram and LinkedIn variants, run brand assessment, and verify approval remains a deliberate human action.
3. **Calendar/publication:** `/calendar`; plan general and industry content, optionally link/unlink a prospect, reschedule/cancel a plan, and confirm publication only for a genuinely published item. Check `/performance` reflects only confirmed publications.
4. **Research/outreach:** `/prospects` → `/prospects/:id`; review sources/claims, approve only supported facts, create/edit a draft, and verify draft/copy does not count as sent. Record a sent action only after external sending and record real replies/meetings separately.
5. **Evaluation:** `/performance`; configure the four-week start/timezone, inspect baseline/intervention completeness, enter only verified Week 0/Week 4 snapshots and native metrics, and verify production/inbound/outbound records retain source/date distinctions.

## Deployment Checklist (Not Executed)

No production deployment was attempted. Repository files contain local PostgreSQL development compose configuration and build commands, but no checked-in production deployment target or rollback automation was found.

- Provision separate development, test, research/evaluation, and production environments. Never point automated tests at research or production data.
- Configure required backend variables from `backend/src/config/env.ts`: `DATABASE_URL`, `ALLOWED_ORIGIN`, session/login settings, and persistent private asset storage. Add provider credentials only in the backend secret manager. Configure `VITE_API_BASE_URL` as public frontend configuration only; do not put secrets in `VITE_*` values.
- Keep `TEST_DATABASE_URL` distinct and restricted to `shifd_marketing_test`.
- Back up the target database and verify restore procedures before any production schema migration. Review each additive migration, then apply with `prisma migrate deploy` through the approved release process. Do not use `migrate reset` in research or production environments.
- Build backend and frontend artifacts in the release environment; configure same-origin `/api` routing, TLS, explicit CORS origin, private persistent asset storage, and `/api/health/live` monitoring.
- Configure OpenAI, Instagram Graph API, and Telegram webhook values only if those integrations are enabled. LinkedIn remains manual analytics entry. Verify webhook HTTPS and operational logs without logging credentials or personal prospect data.
- Define migration rollback/recovery as restore from verified backup or a reviewed forward repair; the repository does not provide automatic down migrations.
- Execute the host-Mac validation command and manual UAT, review database migration status, and obtain explicit deployment approval before release.

## Next Action

Run `cd backend && npm run validate:research` on the host Mac with `TEST_DATABASE_URL` pointing only to migrated `shifd_marketing_test`; then complete the five grouped UAT scenarios. Review and commit changes manually. Deployment requires separate explicit approval.
