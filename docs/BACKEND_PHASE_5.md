# Backend Phase 5 — Asset Storage and Creative Reuse

## Objective

Phase 5 implements the durable private Asset boundary for manually created
marketing creative. It stores immutable PNG/JPEG metadata, serves files only
through authenticated application routes, attaches ordered creative to Content
Variants, supports LinkedIn reuse of Instagram creative, and completes the
approved conditional D-03 creative gate. No AI, file-provider integration, or
later workflow domain was introduced.

## D-05 Phase 5 decision

The configurable prototype defaults are:

- `ASSET_MAX_BYTES=10485760` — 10 MiB
- `ASSET_MAX_WIDTH=8192`
- `ASSET_MAX_HEIGHT=8192`
- `ASSET_UNATTACHED_GRACE_HOURS=168` — 7 days

`ASSET_STORAGE_ROOT` defaults to `./data/assets`. Values are validated during
configuration loading and are not exposed to clients.

## Scope and dependencies

Added only the focused dependencies required for multipart streaming and image
inspection:

- `@fastify/multipart` 9.2.1
- `sharp` 0.34.5

No S3/cloud SDK, Canva SDK, image-generation library, Claude/Anthropic SDK, or
future AI request system was added.

## Files changed

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260914100000_phase_5_asset_storage/migration.sql`
- `backend/src/config/env.ts` and `backend/.env.example`
- `backend/src/app.ts`
- `backend/src/modules/assets/storage.ts`
- `backend/src/modules/assets/service.ts`
- `backend/src/modules/assets/routes.ts`
- `backend/src/modules/assets/cleanup.ts`
- `backend/src/modules/content/service.ts` for Asset projections, reuse, duplication, and D-03
- shared error handling
- `backend/tests/assets.test.ts` and Phase 5 config/test command wiring
- `backend/README.md`
- local Asset-directory ignore rules

`frontend-v1` was not modified.

## Migration and schema

The forward-only migration creates only:

- `creative_assets`: UUID identity, Company/uploader ownership, purpose,
  display filename, opaque storage key, actual MIME, byte size, dimensions,
  checksum, state, and creation time. PostgreSQL checks enforce supported
  purpose/state/MIME values, positive size/dimensions, nonblank metadata, and a
  64-character SHA-256 value. Storage keys are unique and Company/created-time
  indexing is present.
- `variant_assets`: UUID attachment rows with Variant/Asset foreign keys,
  nonnegative `sort_order`, unique `(variant_id, asset_id)`, unique
  `(variant_id, sort_order)`, and reverse Asset indexing.

The migration also adds the required same-Content self-reference for
`platform_variants.reuse_creative_from_variant_id`, including a no-self check
and composite `(content_id, reuse_id)` foreign key. No Phase 6 tables were
created. `npm run db:deploy` applied the migration and `prisma migrate status`
reports no pending migrations.

## Storage abstraction and upload validation

`AssetStorage` owns temporary writes, byte hashing, image inspection, promotion,
read, delete, existence checks, and temporary-file cleanup. The initial
implementation is `LocalAssetStorage` under a private, mode-0700 root with
mode-0600 temporary/final files. Storage keys are random UUID filenames and are
never derived from caller paths or filenames. No static file hosting is
registered.

`POST /api/assets` requires authentication, a valid Origin, CSRF, and
`Idempotency-Key`. It accepts multipart `file` plus `purpose` only. The upload
is streamed to a private temporary file, bounded by the configured byte limit,
checked with Sharp against actual bytes, dimension-checked, SHA-256 hashed, and
promoted to a random final key before ready metadata is committed. Browser MIME,
extension, and filename are not trusted. HTML, SVG, corrupt images, arbitrary
binary, unsupported formats, and oversized files/dimensions are rejected.

The Asset DTO contains only `id`, sanitized `fileName`, actual `mimeType`,
`sizeBytes`, `width`, `height`, `purpose`, authenticated `contentUrl`, and
`createdAt`. It does not contain storage keys, paths, checksums, or internal
uploader data.

Filesystem and PostgreSQL do not share a distributed transaction. Promotion is
performed inside the idempotent database transaction; database failure triggers
best-effort final-file cleanup, temporary files are cleaned in all request
paths, and a process crash between promotion and database commit can leave a
UUID-named orphan until the operator cleanup grace window. The all-Company
cleanup pass compares old UUID files with all known metadata keys and removes
such orphans; this is not claimed as distributed storage. A missing file never
returns successful metadata/content availability.

## Endpoints

Implemented Phase 5 routes are:

- `POST /api/assets`
- `GET /api/assets/:id`
- `GET /api/assets/:id/content`
- `PUT /api/contents/:id/variants/:platform/assets`
- `PUT /api/contents/:id/variants/linkedin/creative-reuse`
- `DELETE /api/assets/:id`

Asset metadata and bytes are Company scoped. Content reads authorize before
opening the server-resolved storage key and return actual persisted MIME with
private/no-store headers. `download=true` uses a sanitized attachment filename;
the default is inline. Wrong-company, pending-delete, and unavailable Assets
are not disclosed as available.

## Attachments and creative reuse

Variant attachment replacement validates same-Company ready Assets with
`purpose=creative`, rejects duplicates, locks the parent Content and candidate
Asset rows, and replaces the complete ordered own collection atomically. Empty
is valid and detaches all links. Detaching never deletes an Asset. Metric
evidence Assets are accepted by the upload subsystem for future Performance
work but cannot attach to a Variant.

Variants expose `ownAssets` and derived `effectiveAssets`. LinkedIn reuse, when
enabled, points only to the same Content's Instagram Variant. It preserves
custom LinkedIn own attachments, resolves effective Assets from Instagram in
source order, and restores LinkedIn own Assets when disabled. The database
composite foreign key prevents cross-Content reuse; route/service checks keep
the public operation fixed to LinkedIn → Instagram. A disabled Instagram
Variant may remain a historical reuse source.

Attachment and reuse changes are real editorial changes: Content `version` and
`editorialRevision` increment once, Variant copy revision and `masterRevision`
do not change, non-Draft progress regresses to Draft according to the Phase 4
rule, and a concise `content_updated` event is appended. Same ordered
attachment input is a no-op and creates no false revision/event. Upload alone
does not mutate Content.

## D-03 compatibility behavior

Phase 5 preserves, rather than redesigns, the approved frontend-v1 D-03 rule.
When `designStatus != ready`, missing creative does not block
`ready_for_review`. When `designStatus == ready`, every enabled Variant must
have at least one effective creative Asset; LinkedIn reuse counts as effective
creative. The existing Master and current complete enabled-Variant adaptation
requirements still apply. This is only editorial eligibility, not Human
Approval or Brand Assessment.

## Content duplication, deletion, and cleanup

Content duplication now creates fresh Content, Brief, and Variant IDs while
reusing the same immutable Asset IDs and ordered attachment links. It does not
copy bytes or Asset metadata. A copied LinkedIn reuse pointer is remapped to the
new duplicated Instagram Variant, never to a source-Content Variant. The
duplicate remains Draft/version 1, preserves `sourceIdeaId` as provenance, and
does not consume the Idea. Existing authored Master, Visual Direction, copy,
and coherent revision relationships are preserved.

Asset deletion is available only when no `variant_assets` reference exists. It
marks the Asset `pending_delete`, removes private bytes, and finalizes metadata
deletion. Failed physical deletion returns an honest internal failure and
leaves retryable `pending_delete` state; it never auto-detaches references.

`npm run assets:cleanup` is an operator-only bounded maintenance command with
optional `--dry-run`. It rechecks references under row locks, respects the
configured grace period, deletes only expired unattached ready Assets, cleans
stale temporary files, and removes old UUID-named final-file orphans during the
all-Company pass. There is no public cleanup route, worker, or cron
implementation.

## Idempotency and events

The Phase 3 `request_idempotency` boundary is reused for Asset upload,
including Company/operation/key scope and deterministic normalized identity
containing actor, purpose, sanitized filename, actual MIME, size, dimensions,
and checksum. Same-key/same-upload retries replay the original Asset response;
different purpose or upload identity returns `IDEMPOTENCY_CONFLICT`. Different
keys are allowed to create independent Assets even for identical bytes. Asset
metadata and its success record commit together; temporary retry uploads are
discarded.

Attachment and reuse mutations append the existing `content_updated` event with
small `asset_collection` metadata, variant identity, actor, and request ID.
Uploads and unattached Asset deletion do not create fictional Content events.
Event metadata contains no file bytes, storage key, path, checksum, session, or
CSRF data. Existing Content Events remain append-only audit history and never
determine current state.

## Tests and validation

`backend/tests/assets.test.ts` uses real Prisma/PostgreSQL and a per-suite
temporary private filesystem root. It groups assertions for A01–A50 across
valid uploads, spoof/corrupt/dimension/size rejection, DTO and authorization
boundaries, upload idempotency, attachment ordering/atomicity, metric evidence,
cross-company ownership, safe delete, cleanup, reuse, duplication, D-03,
revision/event behavior, pending-delete behavior, and read side effects.

## Final local verification

The final verification was completed against the local PostgreSQL 16
environment. Results:

- `npm run db:generate` — PASS
- `npx prisma validate` — PASS
- `npm run db:deploy` — PASS; no pending migration
- `npx prisma migrate status` — PASS; database schema up to date
- PostgreSQL — 16.14 confirmed in Docker; `pg_isready` reported accepting connections
- `npm run test:db` — PASS, 1 test
- `npm run test:auth` — PASS, 5 tests
- `npm run test:context` — PASS
- `npm run test:content` — PASS
- `npm run test:assets` — PASS, 9 tests, 0 failed
- `npm run test:unit` — PASS
- `npm run build` — PASS
- `npm audit --omit=dev` — PASS according to the latest local run

The upload-validation regression was corrected without weakening security:
unsupported actual formats such as HTML, SVG, and arbitrary bytes return
`415 UNSUPPORTED_MEDIA_TYPE`, while bytes identified as PNG/JPEG but malformed
or corrupt return `422 VALIDATION_ERROR`. The final Asset suite passed with
strict actual-byte validation intact.

## Deferred items and limitations

Deferred scope includes Canva/API or OAuth, cloud object storage, image
generation, OCR, Claude/Anthropic, M2 Generate, M3 Adapt, M4 Brand Check,
Brand Assessment, Human Approval, approval overrides/revisions, schedules,
publication, calendar, Performance/metrics/social accounts, and all Phase 6+
domains. Local filesystem persistence requires preserving
`ASSET_STORAGE_ROOT`; deployment does not yet provide a distributed storage/DB
transaction or background cleanup worker. `metric_evidence` remains unattached
until the Performance phase owns its relationship. Canva remains an
external/manual tool and no AI image generation exists. The previously applied
Phase 2 legacy normalization migration remains a forward-safety concern for
future non-empty deployments; its applied history was not rewritten during
Phase 5.

## Readiness

The required local PostgreSQL 16 verification, Phase 2 authentication
regression, Phase 3 context regression, Phase 4 content regression, Phase 5
Asset suite, unit tests, build, and dependency audit completed successfully.
This is development/thesis implementation readiness, not production
certification.

BACKEND PHASE 5 READINESS: READY TO LOCK
