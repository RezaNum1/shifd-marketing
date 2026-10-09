# Prospect and outbound extension

## Scope

This extension adds prospect organizations as supporting business data for Shifd Marketing's existing marketing execution application. Phase 01 implements prospect management and Excel prospect import only. It does not alter the existing Shifd Labs Company Context or Product Context and does not add AI research, email generation, outbound activity tracking, industry content generation, prospect-linked calendar records, or dashboard analytics.

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

## Relationship to existing six modules

Prospects are a supporting business-data capability. The existing six marketing modules and their Company/Product contexts, content and ideas, calendar, Telegram, AI, and performance flows remain separate and unchanged. This phase adds no prospect foreign keys to those existing records and does not feed prospect facts into prompts. Later phases can associate evidence and outbound artifacts without copying or changing current Company/Product context.

## Phased development plan

| Phase | Planned capability | Status |
| --- | --- | --- |
| 01 | Prospect create/list/search/filter/detail/edit/archive and Excel preview/confirm import | Implemented in this change |
| 02 | AI-assisted prospect research with source-backed evidence and explicit human review | Future; not implemented |
| 03 | Personalized outbound email drafts linked to prospects and evidence | Future; not implemented |
| 04 | Outbound communication activity history, replies, follow-ups and meetings | Future; not implemented |
| 05 | Industry-based content generation and planning | Future; not implemented |
| 06 | Optional prospect-linked campaign and content-calendar associations | Future; not implemented |
| 07 | Separate inbound/outbound performance metrics and enhanced evaluation dashboard | Future; not implemented |

The order and boundaries of future phases remain subject to evaluation and thesis supervision. No Phase 02 or later workflow is present in the Phase 01 UI or API.

## Phase 01 limitations

- One contact per organization; multiple contacts and contact-specific history are deferred.
- Industry is free text; there is no canonical sector taxonomy or normalization across synonyms.
- Duplicate detection is a review aid based on normalized name/domain, not a legal-entity resolution system. Matches are not merged.
- Import preview state is temporary review metadata and contains user-supplied contact/company fields until confirmation or expiry; it is company-scoped, token-protected and expiring, but is not an audit archive of the original workbook.
- The importer reads the first worksheet only and does not preserve workbook formatting or formulas.
- There is no restore action in this phase, though archived records remain in storage and can be queried with `archived=true`.
- No imported company facts are researched or verified by the application.

## Four-week research-evaluation considerations

Use `shifd_marketing_test` for automated database integration tests and synthetic workbook fixtures. Never seed or fabricate prospect rows in development, research, or production. During the four-week field evaluation, identify user-supplied/imported records through `source`, preserve creation/update timestamps and creator provenance, and document the participant's source spreadsheet and manual corrections in the research protocol rather than treating spreadsheet facts as verified evidence. Freeze a data dictionary and status definitions before collection; keep prospect status distinct from future outbound activity outcomes. Do not backdate records or alter existing research KPIs. Analyze counts and workflow observations at the approved company/participant scope, and avoid exposing contact details in reports. Record usability feedback and import error categories separately from downstream outcome measures. This phase alone cannot measure research accuracy, outbound effectiveness, or content impact.

## Validation evidence

Validation evidence for this change:

- Backend unit/regression suite: 79 passed in the final local agent run; database-only suites are skipped by this unit command.
- Prospect integration (`npm run test:prospects`): passed on the user's local Mac with PostgreSQL available (user-confirmed); the Codex sandbox did not execute these database assertions.
- Frontend unit suite: 32 passed.
- Backend build and Prisma schema validation: passed.
- Frontend type-check and production build: passed.
- The Prospect integration cases cover CRUD/search/filter/pagination and tenant scoping; preview non-mutation, import confirmation, duplicate/reimport and concurrent confirmation; and archive retention/default exclusion.

Skipped database assertions are not counted as unit-test passes; the integration result above is separately attributed to the user's local run.
