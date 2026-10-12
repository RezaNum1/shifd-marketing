# Four-Week Field Evaluation Protocol

This protocol reflects the advisor-approved four-week intervention. It does not prescribe a fixed calendar start date. Use the company’s configured reporting timezone, preserve evaluation revisions, and record actual source observations only.

## 1. Configure the Evaluation

1. Sign in to the app and open **Planning & Insights → Performance** (`/performance`).
2. Choose the evaluation start date and save. The page uses the company’s configured reporting timezone; it does not expose a separate timezone selector. The API appends an immutable evaluation revision rather than replacing prior configuration.
3. Confirm the returned periods. For start date `S` in the company reporting timezone:
   - Baseline: local midnight `S - 28 days` through, but excluding, local midnight `S`.
   - Intervention: local midnight `S` through, but excluding, local midnight `S + 28 days`.
4. Keep the period definitions, timezone, and measurement definitions with the research log. The app stores definitions and revision metadata with the evaluation configuration.

The canonical API is `PUT /api/evaluation` to configure and `GET /api/evaluation` to retrieve the saved configuration, periods, completeness, source records, and KPI summaries. All requests require an authenticated company session.

## 2. Capture Week 0

At the start boundary, record verified snapshot measurements using **Week 0** on the Performance page. Enter only values visible in the native platform account analytics, record the observation source and notes, and use `null` for an unavailable measurement. The snapshot endpoint is `POST /api/evaluation/:evaluationId/snapshots` with `stage: "week0"`, capture time, measurement values, and source. The API accepts a snapshot only within one day of its configured boundary and does not allow a second snapshot for the same stage in the same revision.

## 3. Record Activity During the Intervention

- **Publishing:** plan work under `/calendar`; record publication only after manual publication has occurred. A planned date passing does not create a publication record.
- **Production time:** record active founder working minutes against the content/campaign using the Performance page or `POST /api/production-time`. The page sends the timestamp entered in its work-time field. Include topic selection, concept/copy, adaptation, visuals, and final review; exclude idle and waiting time. Use the actual work timestamp, not the time the log was entered. Do not backfill estimates as historical observations.
- **Inbound inquiries:** use `POST /api/business-inquiries` for real business inquiries, with received date, channel, relevance, source/provenance, and optional prospect. Do not infer inquiries from comments, follower changes, or replies to founder outreach.
- **Outbound actions:** record actual sent emails, completed follow-ups, replies, meetings, and demonstrations through the prospect activity workflow. Drafting or copying an email is not a sent event. Preserve actual event time and explicit artifact-assistance provenance.
- **Platform measurements:** use the Instagram integration only when connected and retain its observation source/date/scope. Enter LinkedIn values from native LinkedIn Analytics through the manual metrics workflow; preserve its native engagement-rate value.
- Keep human review, claim/source review, and publication approval in their existing workflows. Do not treat an AI draft, research hypothesis, planned post, or unreviewed claim as verified evidence.

## 4. Capture Week 4 and Retrieve Results

At the end boundary, record a verified **Week 4** snapshot. Then retrieve the evaluation from `/performance` or authenticated `GET /api/evaluation`. The dashboard reports period progress and completeness; until the full 28-day intervention elapses, the intervention remains partial and baseline comparisons do not show a completed percentage change.

The Week 4 API payload uses `stage: "week4"` and the corresponding measurement timestamp/source. A snapshot can be recorded within one day of the configured boundary. Retain the returned revision and source record identifiers with the study evidence.

There is no dedicated evaluation export endpoint in the current implementation. Use the authenticated dashboard and API response for review; preserve the response through the approved research record-keeping process without putting secrets or private contacts into shared files.

## 5. KPI Definitions and Interpretation

| Category | Measure | Rule |
|---|---|---|
| Primary execution | Posting consistency | Count actual `PublicationRecord` rows separately for Instagram and LinkedIn. Cadence target is at least 2 published posts per week per platform. Do not count plans or combine platform counts. |
| Primary execution | Cadence compliance | Number of full weeks meeting the platform target divided by 4. Partial intervention compliance is shown as unavailable until complete. |
| Primary execution | Weekly variability | Coefficient of variation uses population standard deviation divided by mean weekly posts. It is N/A when mean posts are zero. |
| Operational effort | Active production time | Sum log minutes per content/campaign within a period; report count, median, minimum, maximum, and observations. These are descriptive intervention measures, not a pre/post efficiency claim. |
| Intervention intensity | Content output | Count actual publication records and distinct content/campaigns separately; one campaign published on two platforms is one campaign and two platform publications. |
| Supporting performance | Instagram | Keep account-level observations separate from per-post values. Do not sum post reach as unique account reach, daily reach as weekly unique reach, or invent unavailable impressions. Show unavailable values as N/A. |
| Supporting performance | LinkedIn | Use manually recorded native analytics. Preserve native engagement rate; do not reconstruct it or compare it directly to Instagram interaction rates. |
| Supplementary acquisition | Inbound inquiries | Count actual received business inquiry records by relevance/channel. Keep outbound replies separate. |
| Outbound execution | Prospect activities | Count actual persisted events and preserve historical, artifact-assisted, and non-artifact-assisted provenance. A draft, copy, scheduled follow-up, or unanswered email does not count as sent/completed/replied. |

For numeric comparisons, absolute change is intervention minus baseline. Percentage change is calculated only when baseline is greater than zero and both measurements are valid. Baseline zero yields N/A percentage change and a numeric absolute change. Missing, unavailable, confirmed zero, and partial observations remain distinct. Changes are descriptive and do not establish causation or brand awareness, recall, conversion, reach, or customer acquisition.

## 6. Source Verification and Safety

- Follow source IDs and observation metadata returned for publication, platform, inquiry, outbound, and production records.
- Use only provider-returned research URLs and claims explicitly approved by a reviewer. Hypotheses remain unconfirmed.
- Do not put private prospect contacts or private outreach discussions into public-facing content.
- Do not create test fixtures in the research or production database. Automated DB tests are restricted to `shifd_marketing_test`.
- Do not fabricate missing baseline observations. Report them as missing and explain the limitation.

## 7. Current Readiness Note

Codex’s Phase 08 validation pass could not connect to the local PostgreSQL test service, so it did not inspect migration state or execute DB-backed evaluation scenarios. User-confirmed host test results are listed separately in `RESEARCH_READINESS_REPORT.md`. Complete the manual checks in that report before treating the artifact as ready for field evaluation.
