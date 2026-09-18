# Backend Phase 11 — M6 Performance Tracking, Metrics & Reporting

Status: implementation complete pending review. No `backend-phase-11` tag has
been created.

Phase 11 adds account-level performance observations and reporting on top of the
locked Phase 10 scheduling/publication model. It does not change the frontend,
add automatic publishing, or infer outcomes that are not present in source
observations. M6 contains **no AI inference**.

## Migration and tables

The single forward migration is:

`backend/prisma/migrations/20260920100000_phase_11_performance_metrics/migration.sql`

It creates the following canonical tables:

- `social_accounts` — one current source configuration per company/platform for
  Instagram, LinkedIn, and WhatsApp.
- `weekly_metrics` — account-level Instagram/LinkedIn observations.
- `inbound_inquiry_metrics` — supplementary aggregate WhatsApp observations.

The migration enables PostgreSQL `btree_gist` and adds a per-account GiST
exclusion constraint over the inclusive `week_start`/`week_end` dates converted
to a half-open `daterange`. The unique account/interval key remains in place as
well. Counts, sources, platforms, modes, connection statuses, interval order,
and positive versions have database checks. Foreign keys protect company,
account, evidence asset, and recorder ownership.

Existing companies receive only the three source-account rows; no metric values
are seeded. Existing Instagram rows are explicitly disconnected demo rows,
while LinkedIn and WhatsApp are manual rows. New operator bootstrap also
provisions the rows. Disconnecting an account does not remove its history.

Prisma models intentionally use simple scalar relations for the new UUID-backed
rows. The stronger migration-owned PostgreSQL constraints remain authoritative
where Prisma cannot represent them without reintroducing the Phase 9 generated
UUID/nested-relation issue. The Phase 10 schedule/publication composite FK is
also retained.

## Sources and intervals

Source labels are inspectable and are never silently mixed:

- `mock` — explicitly labelled demo/mock observation.
- `linkedin_manual` — authenticated human LinkedIn entry/correction.
- `instagram_api` — reserved for a genuinely configured provider adapter.

New research/manual observations use D-04: Monday through Sunday in
`Asia/Jakarta`, represented by the inclusive Sunday `weekEnd` in the API and
the logical half-open interval `[Monday 00:00, next Monday 00:00)` in reports.
Overlapping intervals for one account are rejected by both the service and
PostgreSQL, including concurrent inserts. Zero counts are valid, negative
counts are not, and a missing reach value remains `null`.

Metric evidence may reference only a ready `creative_assets` row with
`purpose=metric_evidence` in the same company. The attachment proves only that
evidence exists; it is not OCR-ed or interpreted. Browser input cannot choose
the source, recorder, social account, or company.

`credential_reference` is an opaque server-side reference and is never returned
by public responses. It is not a token field and no OAuth or provider credential
flow was added.

## Metric and inquiry APIs

Implemented authenticated, Origin/CSRF-protected mutation endpoints are:

- `GET/POST/PUT /api/metrics/linkedin[/:id]`
- `GET/POST/PUT /api/metrics/inquiries[/:id]`

LinkedIn POST always stores `source=linkedin_manual` and the session user as
`recorded_by`. PUT requires the metric ETag (`If-Match`), preserves the metric
ID, increments its version, and records the correction actor. Duplicate or
overlapping observations return `409`; malformed values and non-D-04 dates
return `422`; stale versions return `412`. There is no public metric delete.

Inquiry rows use the WhatsApp account, `source=manual`, the authenticated actor,
the same D-04/non-overlap rules, and their own version ETag. They are aggregate
observations only: no contacts, messages, leads, customers, conversion, CAC,
or content attribution tables were added.

## Integration boundary

`GET /api/integrations` exposes the current database-backed state for all three
platforms without credential references. Existing Instagram boundary actions
are preserved:

- `POST /api/integrations/instagram/connect`
- `POST /api/integrations/instagram/disconnect`
- `POST /api/integrations/instagram/sync`

The current deployment has no approved/configured Instagram Graph adapter.
Demo connection is explicit (`mode=demo`), and demo sync returns
`metricsChanged=false` without fabricating rows. Because no observation is
persisted, demo sync does not advance `lastSuccessfulSyncAt` or the account
version. An API-mode sync/connect returns `INTEGRATION_NOT_CONFIGURED` (503).
There is no publishing capability, background synchronization, cron, or worker.

## Shared reporting service

`backend/src/modules/performance/reporting.ts` is the single selector/calculation
service used by Performance, Overview, and recent-publication reporting. Report
reads use one injected `asOf`, are company-scoped, and are side-effect free.

### Publication reconciliation

PublicationRecord is explicit managed-publication evidence. For each selected
platform/account metric interval:

`effective = max(explicit publications in that interval, reported_published_posts)`

The two sources are never added. Explicit publications not contained by any
selected metric interval are added once as unmatched explicit evidence. Reports
return `explicitPosts`, `reportedPosts`, `effectivePosts`, and
`basis=max_per_account_interval`, preserving a visible explicit count even when
a larger reported aggregate keeps the effective count unchanged.

### Engagement and reach

`engagements = likes + comments + saves` and
`engagementRate = engagements / impressions * 100`. Zero impressions produce
`null`, never zero, infinity, or NaN. Combined engagement is weighted using
the sum of engagements divided by the sum of impressions; platform rates are
not averaged.

Reach is an account/platform observation. Combined reach is the sum of known
Instagram and LinkedIn account reach observations, not unique reach, audience,
or brand awareness. Missing reach remains missing/null. Follower rows remain
separate per platform; follower change compares the earliest and latest
available end-of-week observations. A zero starting observation produces a
`null` percentage rather than an invented infinite value.

### Performance period and rows

`GET /api/performance` accepts `weeks=4|8|12` (default 8) and
`platform=combined|instagram|linkedin` (default combined). It selects the
latest recorded distinct interval starts, not rolling calendar weeks and not
fabricated gaps. The response returns the selected starts, enclosing bounds,
timezone, and one `asOf`. Weekly rows expose `recorded` or `missing` coverage
and retain source labels.

Posting consistency uses the canonical cadence of two posts per platform per
requested week:

`percent = effective published posts / (2 * requested weeks) * 100`

The raw percentage is not capped; only `visualPercent` is capped to 100.
WhatsApp inquiry rows are returned as `{channel:"whatsapp",kind:"supplementary"}`
and are excluded from engagement, reach, follower, and consistency formulas.

Execution uses a separate `periodBasis=schedule_cohort`:

- `planned` = active schedule rows whose `scheduledAt` is in the report cohort;
- `publishedWithinCohort` = those rows with a PublicationRecord;
- `pending` = planned minus published within cohort;
- `onTime` = publication `publishedAt <= scheduledAtSnapshot`.

Content output is explicitly `basis=campaigns` and `scope=all_saved`; its
created/approved/scheduled/published values count Content campaigns, not
platform publications.

## Publications and week joins

`GET /api/publications` returns explicit PublicationRecords in descending
`publishedAt` order with optional platform, half-open time, content, and cursor
filters. Each row joins the matching platform account metric interval that
contains its publication date in that account's reporting timezone. The join is
named `platformMetricsForPublicationWeek` and carries
`scope=platform_account_week`; values are never called post reach,
post impressions, or post engagement and are not attributed to the individual
publication. Missing intervals return `null`.

## Overview

`GET /api/overview` uses the same reporting selectors but preserves the distinct
contract periods:

- published KPI: `publishedPeriod.basis=all_history`;
- this week: current Monday 00:00 through next Monday 00:00 in Asia/Jakarta;
- performance snapshot: fixed latest 8 recorded intervals;
- upcoming: current future actionable schedules, maximum five;
- recently published: explicit publications, maximum five.

`readyToPublish` is a read-time count of active elapsed schedules without a
PublicationRecord. No timer or GET writes it. Needs-review campaigns are
derived from canonical lifecycle/review state and exclude Archived content.
Ideas and active products come from canonical rows. Company readiness requires
company name/description; brand readiness follows the locked frontend's
deterministic brand voice, tone description, and preferred language checks.

## Independence and safety boundaries

Manual publication does not write `weekly_metrics`; metric entry does not create
PublicationRecords. Reconciliation occurs only in read selectors. Publication
corrections preserve the PublicationRecord ID and scheduled snapshot, update
only supported publication metadata, increment the publication and Content
versions, and record a correction event. There is no public unpublish/delete.

No `post_metrics` table exists. Weekly account observations are never converted
into post-level observations. M6 contains no AI recommendation, trend
forecasting, KPI causal interpretation, attribution, or brand-awareness claim.

## Drift and verification

The database was checked with `prisma migrate diff` in script mode without
applying its output. The reported differences are intentional: Prisma wants to
rename/recreate migration-owned indexes and drops stronger raw composite/exclusion
relations it cannot represent in the ORM model; the deployed database retains
those constraints. The Phase 11 database contains `btree_gist` and both weekly
metric/inquiry exclusion constraints. No `db push`, reset, volume removal, or
applied migration edit was used.

All integration suites were run in the Docker Node 22 verification environment
against the existing PostgreSQL volume. The final executed gates were:

- `ai:seed` — pass;
- `test:db` 1/1, `test:auth` 5/5, `test:context` 7/7,
  `test:content` 7/7, `test:assets` 9/9, `test:ai` 8/8,
  `test:adapt` 6/6, `test:brand` 6/6, `test:review` 4/4,
  `test:scheduling` 8/8, `test:performance` 7/7 — pass;
- `test:unit` 10 passed, 68 database tests skipped — pass;
- `build` — pass;
- `prisma validate`, `db:generate`, `db:deploy`, and migration status — pass;
- `npm audit --omit=dev` — three high transitive advisories remain.

The accepted audit result is the existing Prisma tooling chain:

- `deepmerge-ts <8.0.0`, GHSA-ggr8-5vv4-36mx, installed 7.1.5 through
  `@prisma/config`, stack exhaustion;
- `@prisma/config` 6.13.0-dev.1–8.1.0-dev.4, installed 6.19.3;
- `prisma` 6.13.0-dev.1–8.1.0-dev.4, installed 6.19.3.

They are development/tooling transitive dependencies rather than application
runtime production dependencies. `npm audit fix --force` was not run.
