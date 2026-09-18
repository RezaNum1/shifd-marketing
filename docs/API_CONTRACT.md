# Shifd Marketing — Proposed REST API Contract

Planning only, 2026-09-11. No endpoints are implemented by this document.
Baseline: locked `frontend-v1`; see [Architecture](BACKEND_ARCHITECTURE.md) and [Database Schema](DATABASE_SCHEMA.md). Decisions D-01–D-06 remain explicit implementation gates. This contract uses domain resources, not Vue/Pinia serialization.

## 1. Transport and shared rules

Base path `/api`, JSON UTF-8 except multipart uploads and asset binary reads. HTTPS, same-origin cookie authentication. UUID IDs are opaque and stable; platform identifiers are `instagram`/`linkedin` (WhatsApp only for inquiry/configuration). CamelCase JSON, snake_case database. ISO date-only values for weekly periods, RFC3339 offset timestamps for schedule/publication instants; never localized “Just now” strings.

**Response:** single resources `{ "data": Resource }`; lists `{ "data": [Resource], "page": { "limit": 20, "nextCursor": null } }`. Paginated lists accept limit 1–100 (default 20) and opaque cursor using stable `(sortValue,id)` ordering. Aggregate reads are not paginated. 204 has no body. Resource schemas below define complete domain fields; read responses may include reference projections explicitly listed, not arbitrary UI markup. Null means unavailable/absent, not zero.

**Authentication column:** `Public` = no session; `Session` = active internal user, scope resolved from session company. All mutating Session endpoints require same-origin Origin validation and `X-CSRF-Token`. 401/403/404 scope failures apply to every Session row even when not repeated in its error cell. Actor IDs and company ownership are always derived server-side.

**Concurrency:** resource GETs/mutations return `ETag: "<version>"`. `If-Match` required on updates and state-changing commands to an existing versioned resource; missing→428, mismatch→412. Content child commands use **parent content ETag**, including variant copy, creative assignments, approval, schedules and publication. Company aggregate PUT uses contextVersion. Other resources use their version. Reads return `version` for adapters. Asset blobs and append-only logs have no mutation precondition. A child response with Content carries its new parent ETag; publication response includes updated Content.

**Idempotency:** `Idempotency-Key` required on resource-creating POSTs, duplicate actions, AI calls, approval/override/revision actions, schedule creation and publication. Same key/path/body/precondition replays original response; different payload→409 `IDEMPOTENCY_CONFLICT`. Pending same-key AI request→409 `REQUEST_IN_PROGRESS` plus requestId. Session login/logout and local integration simulation are exceptions; DELETE cancellation is naturally idempotent. Lookup replay **before** rejecting a stale ETag, so a successful retry is safe. Resource uniqueness applies even after key expiration.

**General errors:** 400 `MALFORMED_REQUEST`, 401 `UNAUTHENTICATED`/generic `INVALID_CREDENTIALS`, 403 `FORBIDDEN`/`CSRF_INVALID`, 404 `NOT_FOUND`, 409 `STATE_CONFLICT`/`DUPLICATE_INTERVAL`, 412 `REVISION_CONFLICT`, 422 `VALIDATION_ERROR`, 428 `PRECONDITION_REQUIRED`, 429 `RATE_LIMITED`, 500 sanitized `INTERNAL_ERROR`. AI adds 502/503/504; uploads add 413/415. Unknown JSON properties are rejected. Optional URLs are HTTP(S) only and never fetched by the server. Unknown/inaccessible IDs both return 404.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Complete the required Brief fields.",
    "fields": { "brief.targetAudience": "Enter a target audience." },
    "requestId": "req-7e8f"
  }
}
```

Rows below specify request/response, validation, important extra errors and side effects individually. Shared rules above are normative for every row; `none` means absent body, not an unspecified schema. `{} ` means a valid empty JSON object. No public DELETE for products, ideas or contents: lifecycle actions preserve references.

## 2. Domain schemas

Fields named below are required unless suffixed `?`; response nullable fields are returned as null. String lists preserve saved order. Numeric counts are nonnegative safe integers; byte sizes/tokens exceeding JavaScript safe range must be rejected or a future version must explicitly change serialization. No arbitrary business upper limits; transport and file limits are configurable technical limits.

### Identity and configuration

- `User`: id, name, email, role (`founder`). Initials are client-derived.
- `SessionInfo`: user:User, csrfToken:string, expiresAt:timestamp. Cookie never appears in JSON; no password/hash/token field in User.
- `CompanyProfileInput`: name:string, description:string required/nonblank; industry?, businessTypes:(B2B|B2G)[], primaryMarket?, website?, mission?, vision?, positioning?, coreValueProposition?, differentiators:string[], customerSegments:string[], decisionMakers:string[], painPoints:string[]. Lists may be empty; optional text may be null. Website accepts a host with no scheme and normalizes to HTTPS, matching existing shifdlabs.com value.
- `BrandInput`: brandVoice?, toneDescription?, preferredLanguage:English|Indonesian, communicationGuidelines:string[], preferredTerms:string[], thingsToAvoid:string[], ctaStyle?, brandKeywords:string[].
- `BmcBlockInput`: type:one of the nine schema block codes, entries:string[]. `BmcBlock` adds id, version, updatedAt; title derives from fixed taxonomy.
- `CompanyContext`: id, profile:CompanyProfileInput, brand:BrandInput, bmcBlocks:BmcBlock[9], reportingTimezone:`Asia/Jakarta`, contextVersion:number, createdAt, updatedAt. New metric reporting uses this timezone; clients cannot override it per request.
- `ProductInput`: name, description required/nonblank; category?, status:active|inactive|draft, url?.
- `ProductProfileInput`: targetUsers[], targetOrganizations[], decisionMakers[], problemsAddressed[], valueProposition?, features[], benefits[], differentiators[], useCases[], campaignObjective?:awareness|education|engagement|credibility|consideration|discovery, positioning?, keyMessages[], proofPoints[], defaultCta?, inheritCompanyTone:boolean, toneOverride?. All lists contain strings; empty proofPoints and null campaignObjective are valid.
- `Product`: id, companyId, slug, all ProductInput fields, profile:ProductProfileInput (possibly incomplete), version, createdAt, updatedAt. Creation produces an empty associated profile with `campaignObjective:null` and inheritance=true; no generated claims. Operations that require Product Context validate completeness when invoked.
- `ResolvedContext`: company:CompanyContext, product:Product|null, resolvedBrand:{brandVoice:string|null,ctaStyle:string|null,preferredLanguage:string}, toneSource:company|product_override, versions:{company:number,product:number|null}. Full company/brand/BMC remain referenced/resolved live; this is a read projection, not a product write schema.

### Ideas and content

- `IdeaInput`: title:string, contextType:company|product, productId?:UUID, pillarCode:string, objective:objective code, targetAudience?:string, notes?:string. Product required iff product context. Product/pillar must exist; Inactive product cannot be newly selected (existing linked records remain readable).
- `Idea`: id, companyId, IdeaInput fields, status:ready|used|archived, relatedContentIds:UUID[], version, createdAt, updatedAt. Related IDs are read-only projection from content, not writable idea fields.
- `BriefInput`: contextType, productId?, pillarCode, objective, targetAudience, topic, angle?, additionalInstructions?. Required nonblank context/pillar/objective/audience/topic and product in product context. Company ID comes from session. Angle maps frontend `thesis`; additionalInstructions maps `constraints`.
- `MasterInput`: title, coreMessage, hook, body, cta (strings). `VisualDirectionInput`: format, concept, structure:string[], notes. API contains no mock variant index/label.
- `VariantCopyInput`: copy:string, cta:string, hashtags:string, visualRecommendation:string. `copy` maps to Instagram caption or LinkedIn postCopy. Hashtags remain a string to preserve existing editable text; no automatic content rewriting on save/copy.
- `Asset`: id, fileName, mimeType, sizeBytes, width, height, purpose:creative|metric_evidence, contentUrl, createdAt. contentUrl is authenticated same-origin file read; storage key is private. `Attachment`: asset:Asset, sortOrder:number.
- `Assessment`: id, variantId, variantRevision, score:0..100, status:aligned|needs_attention, recommendation, checks:[{label,status:pass|warning}], state:assessed|needs_recheck (derived), requestId, createdAt.
- `ApprovalAction`: id, action:approve|request_revision|override, actor:{id,name}, editorialRevision, variantId:UUID|null, assessmentId:UUID|null, justification:string|null, checklist:Checklist|null, reviewedVariants:array|null, createdAt. `Checklist`: copyReviewed, creativeReviewed, visualCopyConsistent, noErrors, readyForPublication — all Booleans.
- `Schedule`: id, contentId, variantId, platform, scheduledAt, timezone, approvalActionId, cancelledAt:null|timestamp, version. Derived status:scheduled|ready_to_publish|published|cancelled.
- `Publication`: id, contentId, variantId, platform, scheduleId, scheduledAt, publishedAt, postUrl:null|string, markedBy:{id,name}, recordedAt, updatedAt, version. `scheduledAt` is the initial publication timing snapshot. IDs/content/platform project from FK relationships; clients cannot independently write them.
- `Variant`: id, platform, enabled, VariantCopyInput nullable values before adaptation, revision, adaptationState:missing|current|needs_adaptation, reuseCreativeFromVariantId:null|UUID, ownAssets:Attachment[], effectiveAssets:Attachment[], assessment:Assessment|null, schedule:Schedule|null, publication:Publication|null. Effective assets resolve reuse, no duplicated files.
- `Content`: id, companyId, sourceIdeaId:null|UUID, title (derived), brief:BriefInput, master:MasterInput|null, visualDirection:VisualDirectionInput|null, designStatus:not_started|in_progress|ready, variants:Variant[], editorialStage, editorialRevision, lifecycleStatus, resumeStep:null|brief|generate|adapt|creative|review|schedule, approval:ApprovalAction|null, archivedAt:null|timestamp, version, createdBy:{id,name}, createdAt, updatedAt.
- lifecycleStatus uses the approved display vocabulary: Draft, Generated, Adapted, Creative In Progress, Ready for Review, Needs Revision, Approved, Scheduled, Published, Archived. Only the server derives it; not accepted as a mutation field. Editorial stage is an internal code exposed read-only.
- `ContentSummary`: id, title, brief:{topic,pillarCode,objective}, company:{id,name}, product:{id,name}|null, enabledPlatforms, lifecycleStatus, resumeStep, scheduleSummary:Schedule[], publications:Publication[], updatedAt, version. These projections never become independent write sources.
- `ContentEvent`: id, type, contentId, variantId:null|UUID, actor:{id,name}|null, actorKind:user|system, metadata:object, createdAt.

### Metrics and AI

- `WeeklyMetricInput`: weekStart:date, weekEnd:date, followers:integer, impressions:integer, publishedPosts:integer required; reach?:integer|null, likes?:integer=0, comments?:integer=0, saves?:integer=0, evidenceAssetId?:UUID|null, notes?:string|null. For new research records, weekStart is Monday and weekEnd is the following Sunday in Asia/Jakarta; internally this is `[Monday 00:00, next Monday 00:00)`. Legacy/demo intervals may be returned during migration. PublishedPosts maps DB reported_published_posts; it is manually reported aggregate data.
- `WeeklyMetric`: id, platform, WeeklyMetricInput fields, source:mock|linkedin_manual|instagram_api, engagements:integer, engagementRate:number|null, evidence:Asset|null, version, createdAt, updatedAt. No editable engagementRate/source in LinkedIn entry.
- `InquiryInput`: weekStart:date, weekEnd:date, count:integer. `Inquiry`: id, InquiryInput fields, source:manual|mock, version, createdAt, updatedAt. No personal/contact data.
- `Integration`: id:UUID, platform:instagram|linkedin|whatsapp, accountName:string|null, status:connected|disconnected|manual, mode:demo|manual|api, currentSource:string, futureSource:string|null, lastSync:timestamp|null, version. Never credentialReference/token/scopes requiring unpublished integration work.
- `AiSettings`: provider:OpenAI, model:GPT-5.6 Luna, generationLanguage:English|Indonesian, mode:real, status:configured|not_configured, systemStatus:{contextEngine,promptConfiguration,aiConfiguration}, version. Language is the only user-editable setting. Provider/model are safe display metadata; the API key is never returned.
- `PromptVersion`: id, module:M2|M3|M4, operation:generate|adapt|brand_check, version, status:active|retired, updatedAt. No prompt text.
- `AiRequest`: id, module, operation, contentId:null|UUID, variantId:null|UUID, promptVersion:PromptVersion, provider, model, generationLanguage, mode, inputTokens:number|null, outputTokens:number|null, estimatedCostUsd:decimal-string|null, latencyMs:number|null, status:pending|success|failed|stale, errorCode:null|string, errorMessage:null|string (sanitized), createdAt, completedAt:null|timestamp. New requests identify OpenAI; preserved historical Anthropic rows remain Claude-labelled. Titles resolve current content by ID, not copied into log rows.

## 3. Authentication

| Method / path | Purpose | Auth | Request body | Success body/status | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| POST /api/auth/login | Internal sign-in | Public + Origin check | `{email:string,password:string}` | 200 `{data:SessionInfo}`; Set-Cookie | Required valid email/password; generic 401 for invalid/inactive account; 429 rate limit | Verify hash, rotate/create server session. No product records changed. |
| POST /api/auth/logout | End session | Session | none | 204; expire cookie | Common CSRF errors; already absent/expired session may return 204 after Origin check | Revoke session only. |
| GET /api/auth/me | Bootstrap identity after refresh | Session | none | 200 `{data:SessionInfo}` | 401 expired/revoked session | Refresh last-seen within configured limits; no business writes. |

```json
{"email":"reza@shifdlabs.com","password":"<operator-provisioned-password>"}
```

The placeholder is not a seed password. No public signup, password reset, OAuth, JWT refresh or user-management endpoints are added.

## 4. Company Context and products

One company aggregate GET/PUT reflects the current Save Changes behavior across Profile, BMC and Brand. Separate brand/BMC PUT endpoints are deliberately omitted to avoid partial cross-tab saves.

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/company | Complete Company Context | Session | none | 200 `{data:CompanyContext}` | Common errors | None. |
| PUT /api/company | Save all three company tabs atomically | Session | `{profile:CompanyProfileInput,brand:BrandInput,bmcBlocks:BmcBlockInput[9]}` | 200 `{data:CompanyContext}` | Required company fields; exactly nine allowed distinct blocks; If-Match contextVersion; 422 invalid entries, 412 stale | Update company/brand/BMC, increment context version. Live product resolution changes; historic AI/approval evidence unchanged. |
| GET /api/context/resolved | Active Context composition | Session | Query `productId?`; absent=Company | 200 `{data:ResolvedContext}` | 404 missing/wrong-company product | None; read current company/profile/brand/BMC consistently. |
| GET /api/products | List/selector source | Session | Query `status?`, `search?`, pagination | 200 Product list | Allowed status; bounded search | None. UI selectors must fetch all pages; no independent dropdown array. |
| POST /api/products | Add Product + incomplete profile | Session | ProductInput | 201 `{data:Product}` with `profile.campaignObjective:null` and empty lists | Nonblank name/description, enum, URL; 409 duplicate slug resolved with unique suffix | Insert product/profile; no generated objective or marketing claims. |
| GET /api/products/:id | Product Context editor | Session | none | 200 `{data:Product}` | 404 | None. Inheritance fetched via resolved endpoint. |
| PUT /api/products/:id | Save product and profile | Session | `{product:ProductInput,profile:ProductProfileInput}` | 200 `{data:Product}` | If-Match Product version; nullable objective is valid while profile is incomplete; non-null objective/status/arrays are validated, 422 invalid | Atomic profile/info save, version bump; current names resolve on next reads. Inactive preserves all references. |
| GET /api/content-taxonomy | Shared pillars/objectives/platforms | Session | none | 200 `{data:{pillars:[{code,label}],objectives:[{code,label}],platforms:[{code,label}]}}` | Common errors | None; fixed taxonomy, no editor. |

```json
{
  "name": "Shifd Approval",
  "description": "Web-based digital correspondence and approval workflow for organizations.",
  "category": "Business Workflow Software",
  "status": "active",
  "url": null
}
```

## 5. Ideas

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/content-ideas | Bank, search and Recent Ideas | Session | Query `status?`, `search?`, `contextType?`, `productId?`, `pillarCode?`, `objective?`, pagination; updatedAt descending | 200 Idea list | Enum/filter validation; search title/notes/current context name/audience | None. Recent Ideas uses status=ready, small limit. |
| POST /api/content-ideas | Add idea | Session | IdeaInput | 201 `{data:Idea}` | Required fields/product rule; 422 | Insert Ready, no content/AI calls. |
| PUT /api/content-ideas/:id | Edit Ready idea | Session | IdeaInput | 200 `{data:Idea}` | If-Match; 409 if Used/Archived; 422 fields | Update only idea, never existing contents. |
| POST /api/content-ideas/:id/duplicate | Copy idea to Ready | Session | `{}` | 201 `{data:Idea}` | Source exists; If-Match source version | New ID, title suffix, no content links. |
| POST /api/content-ideas/:id/archive | Archive Ready/Used | Session | `{}` | 200 `{data:Idea}` | If-Match; already archived returns same state | Preserve related content. |
| POST /api/content-ideas/:id/restore | Restore Archived to Ready | Session | `{}` | 200 `{data:Idea}` | If-Match; 409 unless archived | Restore status, retain prior links. |

Create Content from Idea initially uses the already fetched Idea to prefill local Brief; no “view idea marks used” endpoint. POST contents is the first meaningful saved action. If a restored idea already has related content, return all links; the adapter can expose existing primary link without losing history.

## 6. Saved content and editorial writes

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/contents | Canonical Library | Session | Query search, contextType, productId, platform, pillarCode, lifecycleStatus, pagination | 200 ContentSummary list | Filters use IDs/allowed enums; 422 invalid | None; live names, derived lifecycle/schedules/publications. |
| POST /api/contents | Save valid Brief, begin creation | Session | `{brief:BriefInput,sourceIdeaId?:UUID,enabledPlatforms:[platform]}` | 201 `{data:Content}` (Draft) | Valid Brief regardless of idea; nonempty unique platforms; idea Ready and same company or 409 | Insert content/brief/variants, mark source idea Used, append brief-created event transactionally; no implicit AI call. |
| GET /api/contents/:id | Detail / complete resume payload | Session | none | 200 `{data:Content}` | 404 supports content not found state | None; all available draft, creative, review, schedule/publication fields returned. |
| PATCH /api/contents/:id | Save complete supplied editorial sections | Session | Any of `{brief:BriefInput,master:MasterInput,visualDirection:VisualDirectionInput,enabledPlatforms:[platform],designStatus:designStatus}`; >=1 key | 200 `{data:Content}` | If-Match; supplied objects complete, unknown fields rejected; valid Brief, >=1 platform; 409 reviewed/published locked write (D-02) | Update supplied sections atomically, increment editorial revision, invalidate affected derived review/adaptation validity; preserve canonical ID and operational records. No schedule/publication write accepted. |
| PUT /api/contents/:id/variants/:platform | Save platform copy | Session | VariantCopyInput | 200 `{data:Content}` | If-Match parent; enabled variant, editable lifecycle; 409 stale/locked | Update target revision only; mark its assessment stale and clear valid approval; preserve other platform copy. |
| POST /api/contents/:id/progress | Record validated editorial milestone | Session | `{stage:adapted|creative_in_progress|ready_for_review}` | 200 `{data:Content}` | If-Match; adapted requires master and current copy for every enabled platform; creative requires adaptations; review follows D-03 gate; 409 invalid transition | Persist editorial stage/event; no AI/approval. This is domain progress, not URL/step focus persistence. |
| POST /api/contents/:id/duplicate | Duplicate as fresh Draft | Session | `{}` | 201 `{data:Content}` | If-Match source; source may be archived/published | New content/variant IDs, copy Brief/master/direction/copy and asset references; clear assessments, approval/overrides, schedules/publications; set Draft. Preserve optional sourceIdeaId as provenance without re-marking idea. |
| POST /api/contents/:id/archive | Soft archive | Session | `{}` | 200 `{data:Content}` | If-Match; already archived no-op | archivedAt set, event; preserve publication/metric/asset facts; no upcoming actionable Calendar entry. |
| GET /api/contents/:id/events | Review History timeline | Session | pagination | 200 ContentEvent list, createdAt descending | 404 | Read actual audit events; never reconstruct synthetic history from current status. |
| GET /api/contents/:id/review-actions | Approval/override history | Session | pagination | 200 ApprovalAction list | 404 | Read decisions including superseded overrides. |

Example meaningful creation (subsequent Generate call is explicit):

```json
{
  "sourceIdeaId": "20000000-0000-4000-8000-000000000001",
  "brief": {
    "contextType": "product",
    "productId": "10000000-0000-4000-8000-000000000001",
    "pillarCode": "educational",
    "objective": "education",
    "targetAudience": "Corporate Administration",
    "topic": "Paper Approval vs Digital Approval",
    "angle": "Explain how documents move through an approval workflow.",
    "additionalInstructions": "Use neutral language and no numerical outcome claims."
  },
  "enabledPlatforms": ["instagram", "linkedin"]
}
```

Response Content initially has master/visualDirection/approval null, empty asset arrays, null variant copy/assessment/schedule/publication and resumeStep=brief. On Generate success it has populated master/direction and resumeStep=generate. Returned IDs are reused; never generate a second content ID after a timeout without checking the idempotent first response.

## 7. Assets and creative reuse

| Method / path | Purpose | Auth | Request body | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| POST /api/assets | Upload immutable image/evidence | Session | Multipart `file` plus `purpose=creative|metric_evidence` | 201 `{data:Asset}` | PNG/JPEG bytes/MIME, configured size/dimension cap; 413/415/422; no caller storage key | Private file + metadata. No attachment until successful assignment. Idempotency key replay avoids duplicate upload metadata. |
| GET /api/assets/:id | File metadata | Session | none | 200 `{data:Asset}` | 404 wrong company/unavailable | None. |
| GET /api/assets/:id/content | Preview/download image | Session | none; optional query download=true | 200 binary MIME; sanitized Content-Disposition, private cache headers | 404 missing; never accept arbitrary file path | None; not JSON. Auth checked before every read. |
| PUT /api/contents/:id/variants/:platform/assets | Replace ordered attachment list | Session | `{assetIds:UUID[]}` | 200 `{data:Content}` | If-Match parent, unique IDs, company/creative purpose, locked review policy; 409/422 | Atomic attachments/order 0..n-1; affect shared LinkedIn review validity when reusing. Detached files retained if referenced elsewhere. |
| PUT /api/contents/:id/variants/linkedin/creative-reuse | Set LinkedIn reuse layer | Session | `{reuseInstagramCreative:boolean}` | 200 `{data:Content}` | If-Match; Instagram source exists, same content; 409 locked | Set/clear source pointer, preserve custom LinkedIn attachment list. No file duplication. |
| DELETE /api/assets/:id | Remove unattached upload | Session | none | 204 | 409 `ASSET_IN_USE` if any creative/evidence reference | Mark pending deletion and remove storage safely; retry/maintenance handles failed physical deletion. |

Replacing a file means upload then assignment; never overwrite the bytes behind an existing referenced asset. Library/Calendar downloads remain valid after starting a new workflow or duplicating a record. Evidence attachment is a normal metric write after upload; no OCR endpoint.

## 8. Server-side AI commands

All three operations resolve provider/model/prompt/language server-side. Bodies do not accept API keys, raw system prompts, actor, provider endpoint, score, or final approval. AI errors include 409 `INPUT_CHANGED`/`REQUEST_IN_PROGRESS`, 422 `INPUT_NOT_READY`, 502 `AI_OUTPUT_INVALID`/`AI_PROVIDER_ERROR`, 503 `AI_NOT_CONFIGURED`, 504 `AI_TIMEOUT`, 429 limit. Error body may add `aiRequestId` for status recovery. Every call requires Idempotency-Key and current Content If-Match.

| Method / path | Purpose | Auth | Request body | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| POST /api/contents/:id/generate | M2 master and visual direction | Session | `{}` | 200 `{data:{content:Content,request:AiRequest}}` | Valid stored Brief/current context; Product context must have the required configured Product Profile fields; incomplete Product Profile→422 `PRODUCT_CONTEXT_INCOMPLETE`; D-02 write gate; AI errors above | Log execution, validate structured output, atomically save master/direction and Generated editorial stage; existing adaptations become stale, not overwritten; no approval. |
| POST /api/contents/:id/adapt | M3 one platform adaptation | Session | `{platform:instagram|linkedin}` | 200 `{data:{content:Content,request:AiRequest}}` | Master exists, enabled target, current Product Context if product-scoped; incomplete Product Profile→422 `PRODUCT_CONTEXT_INCOMPLETE`; AI errors | Save only requested variant copy, bump revision, invalidate its old assessment/override applicability. When all enabled adaptations current, stage Adapted. |
| POST /api/contents/:id/brand-check | M4 advisory assessment | Session | `{platform:instagram|linkedin}` | 200 `{data:{content:Content,request:AiRequest}}` | Target final copy/current input, editable review lifecycle, current Product Context if product-scoped; incomplete Product Profile→422 `PRODUCT_CONTEXT_INCOMPLETE`; AI errors | Insert assessment, point to current result; log event. No approval or schedule. |

```json
{"platform":"instagram"}
```

Same payload shape for adapt and brand-check; path defines the operation. Structured result examples (nested into Content, not untyped provider output):

```json
{
  "score": 92,
  "status": "aligned",
  "recommendation": "Keep the closing consultative.",
  "checks": [{"label":"Tone follows brand guidance","status":"pass"}]
}
```

Scores and recommendations above are illustrative response shapes, not measured thesis findings. In real execution only validated provider results populate them. Request log mode distinguishes demo and real. The backend does not create an AI operation on entering a tab or resolving Company Context.

## 9. Human approval and revision

D-02 defines the approved safe-write policy after approval; D-03 preserves the current conditional creative gate pending reassessment before Human Review implementation. In all cases human review is separate from AI assessment. An override cannot bypass a stale assessment, missing required Brief, or unknown actor.

| Method / path | Purpose | Auth | Request body | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| POST /api/contents/:id/override | Record warning justification | Session | `{platform,assessmentId:UUID,justification:string}` | 201 `{data:{action:ApprovalAction,content:Content}}` | If-Match; current matching assessment with warning; nonblank reason; 409 stale/locked, 422 | Append human override for exact assessment; no automatic approval. |
| POST /api/contents/:id/approve | Final human approval | Session | `{checklist:Checklist}` | 201 `{data:{action:ApprovalAction,content:Content}}` | If-Match; five true checks, >=1 enabled variant, all current assessments, each warning has current justification, D-03 creative gate; 409 stale/locked, 422 | Store actor/time/editorial revision and reviewed variant evidence; set current approval pointer; derive Approved. |
| POST /api/contents/:id/request-revision | Return content for revision | Session | `{reason:string}` | 201 `{data:{action:ApprovalAction,content:Content}}` | If-Match; nonblank reason; 409 archived/fully published; published variants immutable | Append decision, clear current approval, cancel unpublished schedules under D-02, stage Needs Revision. Preserve publications/history. |

```json
{
  "checklist": {
    "copyReviewed": true,
    "creativeReviewed": true,
    "visualCopyConsistent": true,
    "noErrors": true,
    "readyForPublication": true
  }
}
```

Approved state cannot be set through PATCH Content, AI return values, a checklist alone without current assessments, or a timer. Earlier overridden results remain accessible in review-actions/events.

## 10. Schedule, Calendar and manual publication

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| POST /api/contents/:id/schedules | Atomically schedule selected enabled platforms | Session | `{schedules:[{platform,scheduledAt:timestamp,timezone:IANA}]}` | 200 `{data:Content}` | If-Match; unique enabled platforms, current approval, future valid times; 409 published/locked, 422 | Upsert one stable schedule/variant, event, derive Scheduled. Omitted existing schedules unchanged. No publishing. |
| PUT /api/schedules/:id | Reschedule one platform | Session | `{scheduledAt,timezone}` | 200 `{data:Content}` | If-Match parent, same approval valid, future time; 409 already published, 422 | Update timing/event; preserve ID. |
| DELETE /api/schedules/:id | Cancel planned timing | Session | none | 200 `{data:Content}` | If-Match parent; 409 already published | Soft-cancel/event; derive remaining lifecycle; approval remains unless explicitly invalidated. Repeated cancel no-op. |
| GET /api/calendar | Month/week entries derived from schedules | Session | `start:timestamp,end:timestamp` required; platform?, status?:scheduled|ready_to_publish|published, productId?, contextType? | 200 `{data:{start,end,asOf,entries:CalendarEntry[]}}` | start<end, bounded view span <=93 days; valid filters; 422 | None; Ready to Publish computed from server asOf, no mutation. |
| POST /api/schedules/:id/publish | Record manual platform publication or correction | Session | `{publishedAt:timestamp,postUrl?:string|null}` | 200 `{data:{publication:Publication,content:Content}}` | If-Match parent unless idempotent replay; active schedule, approved revision, enabled platform; valid nonfuture publishedAt, optional HTTP(S) URL; 409 cancelled/archived; 422 | Upsert unique variant publication, capture first scheduledAt, event. Correction reuses ID; never increments twice. Does not call a social API or write weekly counts. |

`CalendarEntry`: id (=schedule ID), contentId, variantId, platform, title, company:{id,name}, product:{id,name}|null, pillarCode, scheduledAt, timezone, status, contentVersion. Get Content for final copy/assets/CTA/hashtags in the detail panel. Calendar period filters **scheduledAt**, even if actual publication occurred in a different week. Publication metrics filter **publishedAt**.

```json
{
  "schedules": [
    {"platform":"instagram","scheduledAt":"2026-09-12T10:00:00+07:00","timezone":"Asia/Jakarta"},
    {"platform":"linkedin","scheduledAt":"2026-09-12T14:00:00+07:00","timezone":"Asia/Jakarta"}
  ]
}
```

Dates are examples; schedule validation uses server current time. Publication is allowed before planned time if the human actually published early; the only time gate is not future publication. Account metrics cannot establish that a specific content was published.

```json
{"publishedAt":"2026-09-12T10:08:00+07:00","postUrl":null}
```

After Instagram confirmation, return Instagram publication, LinkedIn schedule without publication, lifecycleStatus Scheduled. After LinkedIn confirmation return lifecycleStatus Published. If already published, changing time/URL is a correction with the same Publication ID and new version; a retry with its original idempotency key returns the original success.

## 11. Performance, historical reconciliation and inquiries

### Shared read schemas

`PublicationCounts`: `{explicitPosts:number,reportedPosts:number,effectivePosts:number,basis:"max_per_account_interval"}`. `Consistency` is the per-platform object defined in PerformanceReport.consistency below. ReportedPosts is summed nonoverlapping manual/imported counts, not a second authoritative managed-post count. EffectivePosts may include explicit posts outside recorded intervals. Default target is 2/platform/week, server canonical configuration.

`PerformanceReport`:

- `period:{basis:"latest_recorded_intervals",requestedWeeks:4|8|12,start:timestamp|null,end:timestamp|null,recordedWeekStarts:date[],timezone,asOf}`;
- `platform:combined|instagram|linkedin`;
- `summary:{latestWeeklyReach:number|null,impressions:number,engagements:number,engagementRate:number|null,published:PublicationCounts}`;
- `followers:[{platform,startObservationDate:date|null,endObservationDate:date|null,start:number|null,end:number|null,change:number|null,changePercent:number|null}]`;
- `weekly:[{weekStart,weekEnd,platform,followers:number|null,reach:number|null,impressions:number|null,engagements:number|null,engagementRate:number|null,source,coverage:"recorded"|"missing"}]`;
- `consistency:[{platform,published:PublicationCounts,targetPerWeek:number,weeks:number,expected:number,percent:number,visualPercent:number}]`;
- `execution:{periodBasis:"schedule_cohort",planned:number,publishedWithinCohort:number,pending:number,onTime:number}`;
- `contentOutput:{basis:"campaigns",scope:"all_saved",created:number,approved:number,scheduled:number,published:number}`;
- `inquiries:{channel:"whatsapp",kind:"supplementary",weeks:Inquiry[]}`.

`RecentPublication`: publication:Publication, content:{id,title}, platformMetricsForPublicationWeek:null|{weekStart,weekEnd,reach,impressions,engagements,source,scope:"platform_account_week"}. No fields named postReach from account data.

`OverviewReport`: asOf, timezone, plannedPlatformSchedules:number, needsReviewCampaigns:number, published:PublicationCounts, publishedPeriod:{basis:"all_history"}, thisWeek:{start,end,consistency:Consistency[]}, performanceSnapshot:PerformanceReport summary plus followers and period (fixed latest 8), upcoming:CalendarEntry[] (max5), recentlyPublished:RecentPublication[] (max5), readyToPublish:number, ideas:{readyCount,latest:Idea[] max3}, context:{companyConfigured:boolean,brandConfigured:boolean,activeProducts:number}. No persisted Overview counters. Published retains the current frontend all-history scope and returns `publishedPeriod:{basis:"all_history"}`; thisWeek is separately current local week. The performance snapshot remains latest eight recorded weeks. Unifying these periods is deferred, not an implicit behavior change. Context booleans use the same deterministic required text checks as frontend, not AI quality scoring.

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/performance | Shared Performance calculations | Session | Query weeks=4|8|12 default8, platform=combined|instagram|linkedin default combined | 200 `{data:PerformanceReport}` | Supported period/filter; 422 | None; recorded weeks as current frontend; coverage explicit. |
| GET /api/overview | Overview aggregation | Session | none | 200 `{data:OverviewReport}` | Common errors | None; current server clock/reporting zone and shared selectors. |
| GET /api/publications | Explicit publication/recent content list | Session | Optional platform, start/end timestamps (half-open), contentId, pagination; publishedAt desc | 200 RecentPublication list | Valid date bounds; 422 | None; joins correct matching metric interval. |
| GET /api/metrics/linkedin | Existing weekly entry records | Session | Optional start/end date filters, pagination | 200 WeeklyMetric list | Valid filters; 422 | None; includes seeded mock source honestly. |
| POST /api/metrics/linkedin | Add weekly manual record | Session | WeeklyMetricInput | 201 `{data:WeeklyMetric}` | Required numbers >=0 including zero; Monday weekStart and following Sunday weekEnd in Asia/Jakarta; half-open interval, nonoverlap/duplicate 409; evidence purpose/company; 422 | Insert source=linkedin_manual, actor from auth; report reads immediately reflect it. |
| PUT /api/metrics/linkedin/:id | Edit same weekly record | Session | WeeklyMetricInput | 200 `{data:WeeklyMetric}` | If-Match metric; same Monday–Sunday validation excluding own ID from overlap check; legacy/demo rows may be migrated but new research boundaries remain canonical; 404 non-LinkedIn ID | Replace fields, preserve ID; source becomes linkedin_manual, never insert duplicate. |
| GET /api/metrics/inquiries | Supplementary WhatsApp history | Session | Optional start/end dates, pagination | 200 Inquiry list | Valid bounds; 422 | None. |
| POST /api/metrics/inquiries | Manual weekly inquiry entry capability | Session | InquiryInput | 201 `{data:Inquiry}` | >=0 count, D-04 dates/nonoverlap; 409/422 | Insert manual count only. Frontend does not gain an unsolicited messaging screen. |
| PUT /api/metrics/inquiries/:id | Correct supplementary weekly count | Session | InquiryInput | 200 `{data:Inquiry}` | If-Match; same interval rules; 409/422 | Update aggregate, no post attribution/CRM. |

No public generic metric upsert that silently overwrites a duplicate LinkedIn week. Instagram observations come through future provider adapter or isolated demo seed, not falsely labeled manual API synchronization.

```json
{
  "weekStart": "2026-08-31",
  "weekEnd": "2026-09-06",
  "followers": 145,
  "reach": 420,
  "impressions": 610,
  "likes": 20,
  "comments": 5,
  "saves": 3,
  "publishedPosts": 2,
  "evidenceAssetId": null,
  "notes": "Entered from the weekly account summary."
}
```

Here engagements=28 and engagementRate=28/610×100≈4.5901639. Rates are computed at full precision; formatting rounds only for display. With impressions=0 rate=null. For the same platform/interval, reported=2 and explicit=2 returns effective=2, not4. No metric row still allows explicit publication count to contribute. Missing reach remains unknown, not a fabricated observation; aggregates return coverage metadata.

**Period details:** latest-recorded mode selects the last N distinct recorded week starts across both platforms, matching frontend-v1. The enclosing start/end is returned. Current-week Overview uses Monday 00:00 in Asia/Jakarta through the next Monday. New research metric rows are always Monday–Sunday half-open intervals; legacy/demo rows can retain original intervals during migration. Reconciliation applies max within each nonoverlapping recorded interval; unmatched explicit publications count once. Partial overlap with the current calendar week uses the whole containing recorded interval with `coverage` dates rather than pretending it is prorated daily data. Explicit-only publication queries support arbitrary half-open date ranges without aggregate ambiguity.

Followers are not summed into a unique audience; return separate platforms. The frontend may display its existing explicitly labeled platform-total summary using those values. Weekly reach sums account reach only for Combined Platform Reach. Never call it Brand Awareness or claim AI caused changes. On-time uses publishedAt <= scheduledAt snapshot, not a blanket published count (D-04 integration acceptance).

## 12. Integration settings

| Method / path | Purpose | Auth | Request body | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/integrations | Source/connection visibility | Session | none | 200 `{data:{instagram:Integration,linkedin:Integration,whatsapp:Integration}}` | Common errors | None; manual sources remain manual. |
| POST /api/integrations/instagram/connect | Preserve demo connection action when demo adapter enabled | Session | `{}` | 200 `{data:Integration}` mode=demo | If-Match integration; 409 outside demo mode, 503 real integration not configured | Demo status only; no fake OAuth/token fields. Real connection flow deferred. |
| POST /api/integrations/instagram/disconnect | Disconnect while retaining history | Session | `{}` | 200 `{data:Integration}` | If-Match; repeat already disconnected no-op | Disable sync capability; preserve historical metrics/content. Future adapter revokes credentials server-side if configured. |
| POST /api/integrations/instagram/sync | Explicit metrics-only sync boundary | Session | `{}` | 200 `{data:{integration:Integration,mode:demo|api,metricsChanged:boolean}}` | If-Match; connected required; 409 sync pending, 503 integration not configured, 502/504 provider failure | Demo with persisted demo fixtures may update lastSync; this deployment has none, so it returns `metricsChanged=false` and leaves lastSync/version unchanged. A real adapter, once authorized, persists measurements before lastSync. No publishing, no background scheduler. |

Frontend owns the Disconnect confirmation dialog and routes Manage LinkedIn Metrics to `/performance/linkedin`; that route consumes the metrics endpoints above. There is no Connect LinkedIn/WhatsApp API. Demo sync records never claim real successful Graph API calls. Research deployment disables demo sync unless explicitly operating with demo data.

## 13. AI & System metadata

| Method / path | Purpose | Auth | Request body/query | Success | Validation / important errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/settings/ai | Provider/model/language/readiness | Session | none | 200 `{data:AiSettings}` | Common errors | None; readiness describes configuration, not an external API guarantee. |
| PUT /api/settings/ai | Save generation language | Session | `{generationLanguage:English|Indonesian}` | 200 `{data:AiSettings}` | If-Match; reject provider/model/secret fields; 422 | Update language for subsequent AI calls, never rewrite existing content or request history. |
| GET /api/prompt-versions | Prompt version visibility | Session | Optional module, status; pagination | 200 PromptVersion list | M2/M3/M4 only; 422 | None. |
| GET /api/prompt-versions/:id | Metadata detail | Session | none | 200 `{data:PromptVersion}` | 404 | None; no full template or editing endpoint. |
| GET /api/ai-requests | Recent execution log | Session | Optional contentId, module, status, mode, pagination | 200 AiRequest list | Company scope; valid filters; 422 | None; current title separately resolves Content. |
| GET /api/ai-requests/:id | Recover pending/failed AI outcome | Session | none | 200 `{data:AiRequest}` | 404 | None; never retries provider. If success, refetch Content. |
| GET /api/ai-usage | Canonical usage summary | Session | Optional start/end timestamps, mode=real|demo default real | 200 `{data:{mode,period:{start,end},requests:number,inputTokens:number,outputTokens:number,estimatedCostUsd:decimal-string,unknownUsageRequests:number,unknownCostRequests:number,currency:"USD"}}` | Valid half-open period; 422 | Sum known log values only, expose missing coverage. Do not mix mock cost into real research usage. |

No model marketplace or full prompt editor. Client reports may display “Content unavailable” when linked content cannot resolve, or “No linked content” for null IDs. Request IDs are trace evidence, not UI-dependent title mappings.

## 14. Operational health

| Method / path | Purpose | Auth | Request | Success | Errors | Side effects |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/health/live | Process liveness | Public | none | 200 `{status:"ok"}` | 503 unhealthy process if service can respond | None; no versions, database credentials or dependency details exposed. |

DB/storage readiness belongs to operator-only diagnostics/deployment checks; no public developer console is added.

## 15. Frontend route coverage

| Frontend route | API groups |
| --- | --- |
| /login | auth/login, auth/me |
| / | overview, company/product/content projections |
| /content/ideas | content-ideas, products, content-taxonomy |
| /content/create | contents, resolved context, AI, assets, review actions, schedules |
| /content | contents |
| /content/:id | complete Content, events, review-actions, assets |
| /calendar | calendar, Content, publication command |
| /performance | performance, publications, inquiries |
| /performance/linkedin | metrics/linkedin, evidence assets |
| /context/company | company aggregate |
| /context/products and /context/products/:id | products, resolved context |
| /settings/integrations | integrations; LinkedIn link uses metrics group |
| /settings/ai | settings/ai, prompt versions, ai-requests, ai-usage |

No step-specific frontend routes are introduced. Router guards remain convenience navigation; backend authentication/authorization enforce access independently.

## 16. Contract acceptance examples for implementation

1. Invalid Brief from new or Idea path→422, no content/idea mutation. Accepted Brief→one content ID; retry same idempotency key→same ID.
2. Resume GET includes all available master/variants/assets/order/reuse/assessments/overrides/approval/schedules/publications. No client fixture default replaces missing real data.
3. PUT Instagram copy returns updated aggregate and stale Instagram assessment only; subsequent stale ETag save→412. Generic PATCH cannot set status, actor or publications.
4. Upload→attach three assets→duplicate/start new→old Content and Calendar still read the same existing asset IDs/files. Detach a shared file→other references intact.
5. M4 warning→approve without override→422; justified current override plus full checklist→Approved. AI success alone never approves. Stale AI completion cannot overwrite a later edit.
6. Schedule both→publish Instagram→Scheduled campaign/LinkedIn still scheduled; repeat→one Instagram PublicationRecord. Publish LinkedIn→Published. Concurrent submissions produce one record/variant.
7. For a platform/week with two explicit posts and manually reported two, effective=2; correct a publication date and both period counts and week attribution react. Sep12 joins Sep7–13 metrics, never Sep14–20.
8. Rename Company/Product→all normal read names update without copying strings into content. Existing execution snapshots stay historical trace evidence only.
9. Disconnect Instagram→weekly metrics retained; mock sync→no generated measurement values. Logout→session revoked, application records unchanged.
10. Errors preserve user input; recoverable idempotency/request IDs allow safe retry. Browser E2E execution remains deferred until an appropriate environment is available; no pass is claimed by this design.


## 17. Representative complete resume response

GET `/api/contents/30000000-0000-4000-8000-000000000001`, ETag `"1"`.
This is a valid freshly saved company Brief with two enabled platform rows; no mock copy or assessment is invented to fill empty fields. Generated/scheduled resources use the same shape with non-null child data.

```json
{
  "data": {
    "id": "30000000-0000-4000-8000-000000000001",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "sourceIdeaId": null,
    "title": "Building Software Around Operational Workflows",
    "brief": {
      "contextType": "company",
      "productId": null,
      "pillarCode": "thought-leadership",
      "objective": "credibility",
      "targetAudience": "Operations Teams",
      "topic": "Building Software Around Operational Workflows",
      "angle": null,
      "additionalInstructions": null
    },
    "master": null,
    "visualDirection": null,
    "designStatus": "not_started",
    "variants": [
      {
        "id": "40000000-0000-4000-8000-000000000001",
        "platform": "instagram",
        "enabled": true,
        "copy": null,
        "cta": null,
        "hashtags": null,
        "visualRecommendation": null,
        "revision": 1,
        "adaptationState": "missing",
        "reuseCreativeFromVariantId": null,
        "ownAssets": [],
        "effectiveAssets": [],
        "assessment": null,
        "schedule": null,
        "publication": null
      },
      {
        "id": "40000000-0000-4000-8000-000000000002",
        "platform": "linkedin",
        "enabled": true,
        "copy": null,
        "cta": null,
        "hashtags": null,
        "visualRecommendation": null,
        "revision": 1,
        "adaptationState": "missing",
        "reuseCreativeFromVariantId": "40000000-0000-4000-8000-000000000001",
        "ownAssets": [],
        "effectiveAssets": [],
        "assessment": null,
        "schedule": null,
        "publication": null
      }
    ],
    "editorialStage": "draft",
    "editorialRevision": 1,
    "lifecycleStatus": "Draft",
    "resumeStep": "brief",
    "approval": null,
    "archivedAt": null,
    "version": 1,
    "createdBy": {"id":"50000000-0000-4000-8000-000000000001","name":"Reza Fadli Harris"},
    "createdAt": "2026-09-11T02:00:00Z",
    "updatedAt": "2026-09-11T02:00:00Z"
  }
}
```
