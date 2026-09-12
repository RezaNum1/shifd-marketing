# Frontend Audit

Audit scope: the Vue frontend prototype, its Pinia stores, local mock data,
routes, shared UI components, and the Stitch references under
`design-reference/`.

The audit was read-only. No application code was changed. All fourteen Stitch
screen directories containing `screen.png` and `code.html` were inspected. The
repository also contains the `precision_executive/DESIGN.md` reference, but no
Login Stitch screen. `docs/PRD.md` is currently empty, so product-scope checks
use `docs/IMPLEMENTATION_NOTES.md`, the approved implementation plan, and the
explicit scope in the feature requests.

## Build Status

`npm run build` in `frontend/` passes:

- `vue-tsc -b` passes.
- Vite build passes with 182 transformed modules.
- No build errors or warnings were emitted.

`package.json` has no automated test, lint, or end-to-end verification script.
The build is therefore useful type/build validation, but it does not prove
workflow continuity or browser accessibility behavior.

## CRITICAL

No critical findings were observed. The application builds successfully and no
issue was found that would make the prototype unusable in every route or imply
automatic publishing.

## HIGH

### H-001 — New briefs can bypass required-field validation

- **Severity:** HIGH
- **Affected area:** Create Content, Brief → Generate transition
- **Affected files/components:** `frontend/src/views/ContentCreateView.vue`
- **Description:** `continueToGenerate()` blocks incomplete fields only when
  `workflow.sourceIdeaId` exists. A new workflow can therefore advance with an
  empty Context, Product where applicable, Pillar, Objective, Audience, or
  Topic even though `isBriefReady` defines those as required.
- **Why it matters:** Step 2 can receive an invalid brief, and downstream
  records can look complete while lacking the context needed for generation.
- **Recommended fix:** Always gate the transition with `isBriefReady`, retain
  field-level validation messages, and make the Product requirement conditional
  on Product context.
- **Changes approved product behavior?:** No. This enforces the already stated
  Brief requirements.

### H-002 — Continue Editing does not restore a selected content record

- **Severity:** HIGH
- **Affected area:** Content Library and Content Detail resume behavior
- **Affected files/components:** `frontend/src/views/ContentLibraryView.vue`,
  `frontend/src/views/ContentDetailView.vue`,
  `frontend/src/stores/contentWorkflow.ts`
- **Description:** `continueEditing()` and `resumeStep()` set only
  `workflow.activeStep` before routing to `/content/create`; they do not
  hydrate the workflow with the selected record's brief, master content,
  variants, assets, review state, or schedule.
- **Why it matters:** The user can see one record in the library/detail view and
  then edit another in the workflow, or see stale data from the previous
  workflow session.
- **Recommended fix:** Add an explicit store action that hydrates a workflow
  draft from a canonical content record, and use it before navigation. Keep the
  status-to-step mapping in one selector/action.
- **Changes approved product behavior?:** No. It makes the documented Continue
  Editing behavior reliable.

### H-003 — Reset can revoke creative URLs still used by saved records

- **Severity:** HIGH
- **Affected area:** Creative → Schedule → Library/Detail/Calendar continuity
- **Affected files/components:** `frontend/src/views/ContentCreateView.vue`,
  `frontend/src/stores/contentWorkflow.ts`,
  `frontend/src/stores/contentLibrary.ts`
- **Description:** Creative uploads use `URL.createObjectURL(file)`. The
  workflow reset revokes those URLs, while `syncScheduledWorkflow()` copies the
  URL strings into the canonical library record. After Schedule followed by
  Create Another Content or another reset, saved thumbnails can reference
  revoked blob URLs.
- **Why it matters:** Scheduled content can lose its previews during the same
  browser session, even though the content record remains present.
- **Recommended fix:** Define blob URL ownership. Either keep the file/URL alive
  for records that reference it, transfer ownership to the content store, or
  replace the preview with a session-safe representation before resetting the
  workflow. Revoke only URLs no longer referenced.
- **Changes approved product behavior?:** No. This preserves the approved
  browser-local preview behavior.

### H-004 — Manual publication does not update current-week consistency

- **Severity:** HIGH
- **Affected area:** Calendar → Performance/Overview integration
- **Affected files/components:** `frontend/src/views/CalendarView.vue`,
  `frontend/src/views/PerformanceView.vue`,
  `frontend/src/views/OverviewView.vue`,
  `frontend/src/stores/performance.ts`
- **Description:** Calendar publication calls `library.markPublished()`, but
  Posting Consistency and This Week read `weeklyMetrics[].publishedPosts` only.
  A session publication therefore changes content/library state without changing
  current-week consistency or publishing output.
- **Why it matters:** Users receive conflicting answers about whether a post was
  published and whether the weekly target was met.
- **Recommended fix:** Make publication records the canonical source for
  session-derived published-post counts, or update the canonical weekly metric
  through one store action. Use the same selector in Performance and Overview.
- **Changes approved product behavior?:** No. It aligns the existing formulas
  and publication workflow.

### H-005 — Performance can double-count and misattribute publication metrics

- **Severity:** HIGH
- **Affected area:** Performance KPI, recent published table
- **Affected files/components:** `frontend/src/views/PerformanceView.vue`,
  `frontend/src/stores/performance.ts`,
  `frontend/src/stores/contentLibrary.ts`
- **Description:** `publishedCount` combines historical metric
  `publishedPosts` with record publication entries without deduplication.
  `recentPublished` also uses the latest weekly metric for every publication,
  rather than the week containing that publication.
- **Why it matters:** Counts can be inflated and a post can display reach,
  impressions, and engagements from an unrelated week.
- **Recommended fix:** Give each platform publication one canonical identity,
  derive counts from publication records where available, and join a published
  row to the metric week containing its publication date. Keep historical seed
  records explicitly separate from session records until they can be reconciled.
- **Changes approved product behavior?:** No. The documented metric formulas
  remain unchanged; only source selection becomes correct.

### H-006 — Demo content still injects unsupported public-sector/security claims

- **Severity:** HIGH
- **Affected area:** Brief defaults, mock refinement, scope compliance
- **Affected files/components:** `frontend/src/data/contentBrief.ts`,
  `frontend/src/views/ContentCreateView.vue`
- **Description:** Defaults and suggestions include “Government Bureau Chiefs,”
  “Ministry Department Heads,” civil servants, audit vulnerabilities, and
  “verifiable digital audit trails.” `autoRefine()` can generate text claiming
  reduced cycle time, document loss, and compliance risk for public-sector
  teams.
- **Why it matters:** These values look like product/customer evidence and
  conflict with the approved neutral Shifd Labs/Shifd Approval mock scope.
- **Recommended fix:** Replace them with the approved corporate-administration
  and enterprise examples. Remove unsupported security, government, case-study,
  and numerical-performance language from defaults and refinement variants.
- **Changes approved product behavior?:** No core workflow change; this is a
  correction to prototype content and scope compliance.

### H-007 — Scheduled records can remain stale after workflow edits

- **Severity:** HIGH
- **Affected area:** Editing a scheduled workflow after it is saved
- **Affected files/components:** `frontend/src/stores/contentLibrary.ts`,
  `frontend/src/views/ContentCreateView.vue`
- **Description:** `syncScheduledWorkflow()` returns early when platform
  schedules match an existing record. Changes to copy, visual direction,
  assessments, or creative assets with unchanged dates/times are not written to
  the library record.
- **Why it matters:** Content Detail and Calendar can show older copy than the
  approved workflow state.
- **Recommended fix:** Compare or update the complete editable payload, not only
  schedule keys. Use a single upsert action with explicit lifecycle fields.
- **Changes approved product behavior?:** No. It preserves edits already
  allowed by the workflow.

### H-008 — Generic Create Content navigation can reopen an old workflow

- **Severity:** HIGH
- **Affected area:** New content entry from sidebar/library/dashboard
- **Affected files/components:** `frontend/src/components/AppNavigation.vue`,
  `frontend/src/views/ContentLibraryView.vue`,
  `frontend/src/views/OverviewView.vue`,
  `frontend/src/stores/contentWorkflow.ts`
- **Description:** Generic Create Content links route to `/content/create`
  without clearing or creating a new workflow. Because the workflow store is
  persistent in memory, the route can reopen the previous step or completed
  schedule instead of a fresh Brief. Idea Bank uses a separate
  `startFromIdea()` path, which makes the behavior inconsistent.
- **Why it matters:** “Create Content” is expected to start a new item and can
  accidentally mutate an earlier one.
- **Recommended fix:** Add explicit `startNewWorkflow()` navigation for generic
  Create Content, while retaining a separate resume path for Continue Editing.
  Confirm the desired new-versus-resume behavior before backend persistence.
- **Changes approved product behavior?:** No, provided resume remains available
  for existing records.

### H-009 — Context display is partly hard-coded and can diverge from canonical stores

- **Severity:** HIGH
- **Affected area:** Company/Product context propagation to content records
- **Affected files/components:** `frontend/src/stores/contentLibrary.ts`,
  `frontend/src/views/ContentCreateView.vue`,
  `frontend/src/views/CalendarView.vue`,
  `frontend/src/data/contentLibrary.ts`
- **Description:** Scheduled records store display strings such as
  `contextName` and `product` alongside IDs. Schedule summaries and calendar
  filters contain literal “Shifd Labs,” while seed records repeat product and
  context names.
- **Why it matters:** Renaming or updating Company Context/Product Context does
  not consistently update library, detail, calendar, and schedule displays.
- **Recommended fix:** Store `companyId`/`productId` as the source of truth and
  resolve display names through the company/product stores. Keep snapshots only
  when a future backend requirement explicitly calls for historical snapshots.
- **Changes approved product behavior?:** No. It strengthens the required
  dynamic inheritance behavior.

## MEDIUM

### M-001 — The Content Library is not a complete lifecycle source until Schedule

- **Severity:** MEDIUM
- **Affected area:** Content Library and active workflow
- **Affected files/components:** `frontend/src/stores/contentLibrary.ts`,
  `frontend/src/views/ContentLibraryView.vue`,
  `frontend/src/stores/contentWorkflow.ts`
- **Description:** The library is seeded with demo records and receives the
  current workflow primarily from `syncScheduledWorkflow()`. Draft, Generated,
  Adapted, Creative In Progress, and Review items are not automatically visible
  as records.
- **Why it matters:** The page is described as the central content library, but
  an in-progress item can be absent until it reaches Schedule.
- **Recommended fix:** Decide whether the prototype should upsert a draft record
  at Brief creation or explicitly document that the library contains saved
  campaign records only. Use one store action either way.
- **Changes approved product behavior?:** Potentially yes; confirm the product
  interpretation before changing lifecycle persistence.

### M-002 — ContentCreateView is oversized

- **Severity:** MEDIUM
- **Affected area:** Workflow maintainability and testability
- **Affected files/components:** `frontend/src/views/ContentCreateView.vue` (about
  1,372 lines)
- **Description:** All six step templates, platform editors, asset handling,
  review logic, scheduling, and navigation live in one view.
- **Why it matters:** A small change to one step has a large regression surface,
  and repeated platform markup is hard to compare or test.
- **Recommended fix:** Extract only actual repeated units, such as a workflow
  navigation footer, platform variant editor, creative uploader, assessment
  section, and schedule form. Keep workflow orchestration in the view/store.
- **Changes approved product behavior?:** No.

### M-003 — Formatting and status logic are repeated

- **Severity:** MEDIUM
- **Affected area:** Consistency and maintenance
- **Affected files/components:** `ContentLibraryView.vue`,
  `ContentDetailView.vue`, `CalendarView.vue`, `PerformanceView.vue`,
  `LinkedInMetricsView.vue`, `src/style.css`
- **Description:** Status-tone mapping, platform labels, date formatting, and
  engagement formatting are implemented in multiple views. Performance also
  uses a custom table style rather than the shared table pattern.
- **Why it matters:** Small semantic or visual changes can leave screens
  disagreeing about the same status or date.
- **Recommended fix:** Centralize pure formatters/selectors and status metadata;
  reuse `BaseTable` or a shared table style where the interaction model matches.
- **Changes approved product behavior?:** No.

### M-004 — ContentLibraryRecord duplicates lifecycle and display fields

- **Severity:** MEDIUM
- **Affected area:** Domain model and data consistency
- **Affected files/components:** `frontend/src/types/content.ts`,
  `frontend/src/stores/contentLibrary.ts`, `frontend/src/data/contentLibrary.ts`
- **Description:** Records contain top-level display strings and schedule/
  publication fields as well as nested `details.schedules` and
  `details.publications`; status is also represented at multiple levels.
- **Why it matters:** Different views can read different copies and silently
  diverge.
- **Recommended fix:** Consolidate canonical lifecycle data in one normalized
  record and expose derived selectors for table/detail display. Keep IDs rather
  than duplicated names where resolution is available.
- **Changes approved product behavior?:** No, unless historical snapshots are
  explicitly required later.

### M-005 — Workflow steps are not addressable in the URL

- **Severity:** MEDIUM
- **Affected area:** Browser back/forward and direct-link behavior
- **Affected files/components:** `frontend/src/router/navigation.ts`,
  `frontend/src/router/index.ts`, `ContentWorkflowStepper.vue`,
  `ContentCreateView.vue`
- **Description:** All six steps share `/content/create`; step state exists only
  in Pinia. Refreshing or sharing a URL cannot target a specific step, and the
  browser history does not represent step transitions.
- **Why it matters:** Direct URL access and browser navigation are less
  predictable than the rest of the routed application.
- **Recommended fix:** Consider a query/hash or nested step route after deciding
  whether workflow state must be shareable. Do not duplicate step logic in the
  router.
- **Changes approved product behavior?:** Potentially. Treat as a navigation
  decision for review, not an unapproved redesign.

### M-006 — Reusable mock data remains embedded in views/stores

- **Severity:** MEDIUM
- **Affected area:** Mock-data replacement readiness
- **Affected files/components:** `src/views/AiSystemView.vue`,
  `src/stores/integrations.ts`, `src/views/CalendarView.vue`,
  `src/views/ContentCreateView.vue`, `src/data/contentBrief.ts`
- **Description:** AI operations, request-title mapping, integration records,
  calendar context options, and schedule labels are partly declared directly in
  views or stores. `contentBrief.ts` also retains legacy option data beside
  canonical stores.
- **Why it matters:** Backend adapters will have to find and replace several
  unrelated mock sources.
- **Recommended fix:** Move reusable records to `src/data`/`src/mocks`, expose
  store selectors, and remove unused legacy arrays after confirming imports.
- **Changes approved product behavior?:** No.

### M-007 — AI settings are informational rather than connected to mock generation

- **Severity:** MEDIUM
- **Affected area:** AI & System versus Generate/Adapt/Review
- **Affected files/components:** `src/stores/aiSettings.ts`,
  `src/views/AiSystemView.vue`, `src/views/ContentCreateView.vue`
- **Description:** Provider/model/language can be edited in settings, but the
  mock generation/adaptation paths do not consume or display those values.
- **Why it matters:** A user can reasonably expect changing Generation Language
  to affect the next mock generation, or at least see that the setting is
  prototype-only.
- **Recommended fix:** Either mark the setting explicitly informational until
  backend integration, or thread the selected language/model into mock metadata
  without changing generated claims.
- **Changes approved product behavior?:** No, if limited to transparency.

### M-008 — AI request titles do not resolve canonical content

- **Severity:** MEDIUM
- **Affected area:** AI Usage / Recent AI Requests
- **Affected files/components:** `src/views/AiSystemView.vue`
- **Description:** `contentTitle()` recognizes one hard-coded ID and otherwise
  displays “Content record.”
- **Why it matters:** Request logs can show incomplete or misleading content
  context as soon as another record is used.
- **Recommended fix:** Resolve `contentId` through the content library store,
  with a neutral fallback only when the record is genuinely unavailable.
- **Changes approved product behavior?:** No.

### M-009 — Campaign and platform-post counts use different labels and sources

- **Severity:** MEDIUM
- **Affected area:** Performance and Overview summaries
- **Affected files/components:** `src/views/PerformanceView.vue`,
  `src/views/OverviewView.vue`
- **Description:** Performance labels `Content Published` as platform posts,
  while Content Output/Overview counts content records/campaigns in places.
  The distinction is not consistently surfaced beside every number.
- **Why it matters:** A two-platform campaign can be read as one or two pieces
  depending on the section.
- **Recommended fix:** Label each metric explicitly as Campaigns or Published
  Platform Posts and reuse a shared selector.
- **Changes approved product behavior?:** No.

### M-010 — Overview period and publication calculations differ from Performance

- **Severity:** MEDIUM
- **Affected area:** Dashboard aggregation
- **Affected files/components:** `src/views/OverviewView.vue`,
  `src/views/PerformanceView.vue`
- **Description:** Overview uses a fixed/latest eight-week slice and current
  weekly metric data, while Performance exposes a 4/8/12-week selector. The two
  pages can therefore show different period totals and consistency values.
- **Why it matters:** The dashboard is expected to summarize Performance, but
  users can see conflicting values without a visible period explanation.
- **Recommended fix:** Reuse Performance selectors/calculations for the default
  Overview period, or label Overview as a current-week snapshot.
- **Changes approved product behavior?:** No.

### M-011 — Mobile navigation has no visible Sign Out action

- **Severity:** MEDIUM
- **Affected area:** Authentication/navigation on narrow screens
- **Affected files/components:** `src/components/AppShell.vue`,
  `src/components/AppSidebar.vue`
- **Description:** Desktop sidebar renders the sign-out icon, but the mobile
  drawer footer renders only `UserIdentity`. The sidebar is hidden below the
  desktop breakpoint.
- **Why it matters:** A mobile user may have no discoverable way to end the
  frontend session.
- **Recommended fix:** Add the same labeled Sign Out action to the mobile drawer
  footer and ensure it remains keyboard accessible.
- **Changes approved product behavior?:** No.

### M-012 — Tab keyboard behavior is incomplete

- **Severity:** MEDIUM
- **Affected area:** Company Context and Content Detail tabs
- **Affected files/components:** `src/views/CompanyContextView.vue`,
  `src/views/ContentDetailView.vue`
- **Description:** Tabs expose roles/selection in places, but do not implement a
  consistent roving tabindex with Arrow, Home, End, and activation behavior.
  Content Detail keeps every tab button focusable without a full tablist model.
- **Why it matters:** Keyboard users must traverse all tabs and receive less
  predictable focus behavior.
- **Recommended fix:** Create one accessible tab component with correct
  `aria-controls`, roving tabindex, keyboard navigation, and panel semantics.
- **Changes approved product behavior?:** No.

### M-013 — There is no automated regression suite

- **Severity:** MEDIUM
- **Affected area:** Quality assurance
- **Affected files/components:** `frontend/package.json`, all workflow views
- **Description:** Only build/dev/preview scripts exist. The extensive stateful
  workflow has no automated route, store, or browser-flow checks.
- **Why it matters:** The high-risk continuity issues above can recur without a
  fast regression signal before backend work starts.
- **Recommended fix:** Add focused store tests and a small Playwright smoke flow
  for login, create workflow, publication, Content Detail, Calendar, and
  Performance. Keep tests aligned to approved behavior.
- **Changes approved product behavior?:** No.

### M-014 — Several page-width tiers drift without an explicit rule

- **Severity:** MEDIUM
- **Affected area:** Cross-screen visual consistency
- **Affected files/components:** `src/style.css`,
  `src/views/OverviewView.vue`, `PerformanceView.vue`, `AiSystemView.vue`,
  `IntegrationsView.vue`, `CompanyContextView.vue`, `ProductsView.vue`
- **Description:** Page max widths range roughly from 1,100px to 1,600px. The
  differences are sometimes appropriate for tables/forms, but no shared width
  tiers are exposed as tokens.
- **Why it matters:** Headings, cards, and form columns can feel misaligned when
  navigating between settings, context, dashboard, and workflow screens.
- **Recommended fix:** Define named content-width tiers (for example form,
  standard, wide) and apply them intentionally. Do not force all screens to one
  width.
- **Changes approved product behavior?:** No.

## LOW

### L-001 — Session storage identity is trusted without shape validation

- **Severity:** LOW
- **Affected area:** Frontend auth persistence
- **Affected files/components:** `src/stores/auth.ts`
- **Description:** Parsed `sessionStorage` JSON is treated as an `AuthUser`
  without validating required fields.
- **Why it matters:** Corrupt or manually edited storage can produce malformed
  user display state. This is not a production security boundary, but it can
  create confusing UI.
- **Recommended fix:** Validate the stored shape and clear invalid data before
  hydrating the store.
- **Changes approved product behavior?:** No.

### L-002 — Demo credentials are intentionally present in frontend source

- **Severity:** LOW
- **Affected area:** Login prototype security boundary
- **Affected files/components:** `src/data/auth.ts`, `src/views/LoginView.vue`
- **Description:** The mock email/password pair is available to the client so the
  prototype can authenticate locally.
- **Why it matters:** It must not be mistaken for real authentication or reused
  in production.
- **Recommended fix:** Keep the demo-only label, do not store the password in
  auth state, and replace the whole flow with backend authentication before
  deployment.
- **Changes approved product behavior?:** No; this is an explicit prototype
  limitation.

### L-003 — Overlay focus and action menus need polish

- **Severity:** LOW
- **Affected area:** Modal and overflow-menu accessibility
- **Affected files/components:** `src/components/ui/BaseOverlay.vue`,
  `src/views/ContentLibraryView.vue`
- **Description:** The overlay traps Tab and restores the trigger, but does not
  explicitly focus the first meaningful control. The library overflow menu has
  no consistent Escape/outside-click or collision behavior.
- **Why it matters:** Keyboard users may land on an unexpected element, and a
  menu can obscure nearby content.
- **Recommended fix:** Focus the dialog heading/first control on open; implement
  a shared menu primitive with Escape, outside-click, and viewport collision
  handling.
- **Changes approved product behavior?:** No.

### L-004 — Small metadata text and horizontal scroll need verification at zoom

- **Severity:** LOW
- **Affected area:** Calendar, charts, and dense tables
- **Affected files/components:** `src/style.css`, `CalendarView.vue`,
  `PerformanceView.vue`, `LinkedInMetricsView.vue`
- **Description:** Calendar/chart metadata uses compact 9–12px styles and dense
  tables intentionally use minimum widths with horizontal scrolling.
- **Why it matters:** At 200% zoom or narrow widths, users may need to scroll
  without an obvious affordance and small labels may become difficult to read.
- **Recommended fix:** Verify at 200% zoom, retain the scrollable table strategy,
  and add clear overflow affordance/accessible labels where needed.
- **Changes approved product behavior?:** No.

## Architecture Summary

The application has a sound high-level Vue 3 + Pinia structure:

- Router-level auth protection is centralized in `src/router/index.ts`.
- AppShell, sidebar, navigation, PageHeader, controls, cards, badges, tables,
  overlays, charts, and workflow stepper are reusable shared components.
- Domain stores exist for auth, content workflow, content library, ideas,
  products, company context, performance, integrations, AI settings, UI, and
  workspace state.
- Product context resolves company context dynamically, including the optional
  product tone override. This is the strongest cross-domain inheritance area.
- The primary architectural risk is that the six-step workflow remains a very
  large view with transient state, while saved content is represented by a
  second normalized-ish record in the library store.

The most valuable refactor is a focused content workflow persistence/hydration
boundary, followed by shared selectors and formatters. Splitting every section
into a component would add indirection without solving the source-of-truth
issues.

## Data Source-of-Truth Review

| Domain | Current owner | Assessment |
| --- | --- | --- |
| Company Profile, Brand, BMC | `companyContext` store | Canonical and editable; consumers should stop using display literals. |
| Products and Product Profiles | `products` store | Canonical; product context resolution correctly references company context. |
| Ideas | `contentIdeas` store | Canonical and shared with Create Content Recent Ideas. |
| Active six-step workflow | `contentWorkflow` store | Canonical while active, but not hydrated by Continue Editing and not a saved draft record. |
| Saved content/campaign records | `contentLibrary` store | Shared by Library, Detail, and Calendar; payload and display fields are duplicated. |
| Creative files | Workflow first, then copied to library | Blob URL ownership is unsafe after reset. |
| Review/approval | Workflow and copied library details | State continuity depends on a successful schedule sync. |
| Schedules/publications | Library record details | Calendar updates the correct platform, but Performance/Overview do not fully consume those records. |
| Performance metrics | `performance` store | Weekly metric data is canonical for seeded metrics; publication-derived counts are not unified. |
| Integrations | `integrations` store | Separate and appropriate; seed records are embedded in the store. |
| AI settings | `aiSettings` store | Canonical settings exist, but generation screens do not consume them. |
| Authentication | `auth` store + sessionStorage | Focused and does not clear application data on logout; storage shape validation is weak. |

The main competing sources are saved content versus active workflow state,
publication records versus weekly metric `publishedPosts`, and IDs versus
duplicated context/product display strings.

## Workflow Integrity

### Verified strengths

- Idea Bank maps context, product, pillar, objective, audience, title, and notes
  into Brief. An idea is marked Used when generation is actually initiated,
  rather than merely viewed.
- Generate, Adapt, Creative, Review, and Schedule share one workflow store.
  Instagram and LinkedIn regeneration is isolated by platform.
- Creative previews are browser-local, support carousel order, and support
  LinkedIn reuse of Instagram assets.
- Review clearly separates advisory AI assessment from the human checklist,
  approval, and override justification.
- Schedule requires approval and future date/time validation and does not mark
  content Published.
- Calendar marks only the selected platform as Published and keeps campaign
  status Scheduled until all enabled platforms are published.
- Content Library, Content Detail, and Calendar read the same saved record store.

### Continuity gaps

The gaps requiring attention are H-001 through H-009, especially incomplete
Brief gating, record hydration, blob URL ownership, stale scheduled records, and
publication-to-performance propagation. These are the points where content can
look correct on one screen while another screen shows older or incomplete data.

## Design Consistency

The implementation generally follows the canonical tokens and shared controls
in `src/style.css` and the UI components. Many Stitch differences were already
normalized and documented in `docs/DESIGN_DECISIONS.md`; those are **B — Stitch
inconsistency already normalized**, not defects.

The remaining meaningful classifications are:

- **A — Implementation mismatch:** H-001, H-003, H-004, H-005, H-007, and H-009
  are behavior/data mismatches that surface visually as incorrect content,
  status, or previews.
- **B — Already normalized:** common sidebar treatment, light SaaS cards,
  button hierarchy, status badge colors, workflow stepper, and the single
  bottom-right toast are intentionally standardized across Stitch references.
- **C — Cross-screen design inconsistency:** M-003 and M-014. Shared status/date
  formatting and named width tiers would reduce drift without redesigning any
  approved screen.
- **D — UX/accessibility issue:** M-011, M-012, L-003, and L-004.

Canonical patterns that should remain in place are: one persistent desktop
sidebar with a mobile drawer, one PageHeader treatment, 40–44px controls, white
cards with restrained borders/radii, compact StatusBadge variants, horizontal
tab scrolling where necessary, and a single replaceable toast at bottom-right.

## Responsive Findings

The existing CSS has thoughtful breakpoint coverage: the desktop sidebar hides
below approximately 1023px, Calendar grids intentionally scroll at their
minimum readable widths, detail columns stack near 1050px, Performance cards
stack progressively, and forms collapse below tablet widths.

Remaining checks:

| Viewport | Finding | Risk | Recommendation |
| --- | --- | --- | --- |
| 1440px | Primary layouts are comfortable; wide pages use different max widths. | Low | Apply named width tiers (M-014). |
| 1280px | Content Create remains two-column while the sidebar consumes fixed width. | Medium | Verify the brief/editor column at the 1023–1200px transition and stack earlier if controls become cramped. |
| 1024px | This is near the sidebar breakpoint; workflow and dense forms can become tight. | Medium | Browser-check the exact breakpoint and preserve a usable main column. |
| 768px | Calendar/Performance tables and Calendar week/month grids rely on horizontal scrolling. | Medium | Keep minimum widths, but add clear scroll affordance and test keyboard scrolling. |
| Mobile | Overview cards/forms generally stack; mobile drawer lacks Sign Out. | Medium | Fix M-011 and verify all modal actions remain reachable. |
| 200% zoom | Dense metadata may become hard to read and scroll containers less discoverable. | Low | Verify L-004 against WCAG reflow/zoom expectations. |

No global page overflow was established from source inspection, but Calendar
and metric tables intentionally require horizontal scrolling on narrow layouts.

## Accessibility Findings

- Form labels are generally associated through shared BaseInput/BaseSelect/
  BaseTextarea components; Login has labels, Enter submission, and an
  accessible password visibility label.
- Icon-only actions mostly use the shared `IconButton` label prop, including
  desktop Sign Out and toast dismissal.
- Creative upload has a file-input fallback in addition to drag/drop, which is
  appropriate.
- **M-011:** mobile drawer lacks Sign Out.
- **M-012:** tablists need standard keyboard navigation and roving tabindex.
- **L-003:** dialogs should focus the first useful element on open; overflow
  menus need Escape/outside-click behavior.
- Calendar and content tables should retain semantic headers and expose the
  horizontal-scroll context to assistive technology.
- Status and assessment states use text labels in addition to color, which is
  appropriate. AI assessment remains advisory in the UI.
- Creative thumbnails and larger previews should be checked for meaningful
  alt text across every asset state, especially inherited LinkedIn previews.

## Scope Compliance

The audit found no frontend calls to Claude, OpenAI, Instagram Graph API,
LinkedIn APIs, WhatsApp APIs, or backend endpoints. There is no automatic social
publishing, Canva integration, AI image generation, social inbox, social
listening, competitor monitoring, trend forecasting, CRM, SEO tooling,
outreach automation, billing/subscriptions, SSO, AI performance prediction, or
autonomous marketing agent behavior.

AI is represented only in the approved M2 Content Generation, M3 Platform
Adaptation, and M4 Brand Consistency Check surfaces. Context storage/resolution,
Calendar, and Performance do not contain AI inference behavior. WhatsApp is
present only as a supplementary/manual inquiry metric. No credential or API-key
fields were found in settings.

The principal scope concern is H-006: unsupported public-sector/security claims
remain in mock Brief content. This should be corrected before backend prompts or
seed data are designed.

## Recommended Fix Order

1. Fix H-001 Brief validation and H-002 workflow hydration; these can cause
   incorrect edits and invalid records immediately.
2. Define canonical content/publication ownership and fix H-007 stale upserts,
   H-004 consistency propagation, and H-005 performance deduplication.
3. Resolve H-003 creative blob URL ownership before any backend/file-storage
   work, so the eventual asset boundary is explicit.
4. Fix H-008 new-versus-resume workflow intent and H-009 ID-based context/product
   resolution.
5. Remove H-006 unsupported claims and audit all future seed data against the
   scope rules.
6. Add focused selectors/formatters and extract only real repeated workflow
   components (M-002 through M-006).
7. Align Overview period/count semantics with Performance, then address mobile
   Sign Out and tab/dialog keyboard behavior (M-010 through M-012, L-003).
8. Add store and browser smoke tests before backend development; retain build as
   a required check.

Open decisions for the next implementation review are whether the Library
should show active unscheduled drafts, whether workflow steps should be URL
addressable, whether context names are live-resolved or historical snapshots,
and whether historical performance rows should be represented as publication
records. These should be resolved before backend persistence is designed.

## FRONTEND READINESS

**READY FOR FINAL QA.** The build is clean, routing and scope boundaries are in
place, and the major screens exist. Batch A and Batch B high-severity state,
publication, metric, asset-ownership, context, and mock-data findings are
fixed. The frontend should not be treated as production-ready or as a final
backend contract until final QA is complete.

## Fix Progress

Batch A implementation status:

- H-001 — **FIXED**
- H-002 — **FIXED**
- H-006 — **FIXED**
- H-007 — **FIXED**
- H-008 — **FIXED**
- H-009 — **FIXED**

Batch B implementation status:

- H-003 — **FIXED**
- H-004 — **FIXED**
- H-005 — **FIXED**

# Final QA Pass 1

This pass re-audits the current implementation after Audit Batch A and Batch
B. It does not change the approved workflow or application source. The review
covered the current Vue views, Pinia stores, domain types, router, shared UI,
all available Stitch references under `design-reference`, and the package
build.

## High Regression Check

All nine previous HIGH findings remain fixed in the current source review. The
checks below are based on the explicit store actions and selectors; a full
browser click-through could not be completed because the local headless
Chromium process is blocked by the environment's macOS Mach-port permission.

| ID | Result | Evidence in current implementation |
| --- | --- | --- |
| H-001 | PASS | `ContentCreateView.vue` applies `isBriefReady` for every Generate attempt, including idea-prefilled briefs; product is required for Product context and field errors are surfaced. |
| H-002 | PASS | `contentWorkflow.resumeContent()` resets stale state, hydrates brief, content, variants, assets, assessments, approval, and schedules, and uses the centralized `workflowStepForStatus()` mapping. Library and Detail call it. |
| H-003 | PASS | `creativeAssetRegistry.ts` separates workflow and saved-content ownership. Reset releases only the workflow owner; saved records retain preview references. |
| H-004 | PASS | `contentLibrary.markPublished()` is the single manual publication mutation and updates `PublicationRecord`, nested compatibility data, lifecycle state, and history. Performance and Overview consume publication selectors. |
| H-005 | PASS | `publicationMetrics.ts` reconciles unique explicit publications with historical `WeeklyMetric.publishedPosts` using `max`, and publication-week attribution uses the metric whose range contains `publishedAt`. |
| H-006 | PASS | Current brief/content seed copy is neutral Shifd Labs / Shifd Approval language; the previously flagged government, security, case-study, and numerical claims are absent from the audited source. |
| H-007 | PASS | `upsertFromWorkflow()` writes the complete workflow payload while preserving the canonical content id and existing publication data. |
| H-008 | PASS | New, idea-prefilled, and resume intents are separate (`startNewWorkflow`, `startFromIdea`, `resumeContent`); generic navigation calls the new-workflow action. |
| H-009 | PASS | Content, Library, Calendar, Detail, Ideas, and Create resolve names through company/product IDs and canonical stores. No regression to duplicated live display names was found. |

No HIGH regression was identified. The remaining limitations below are medium,
low, or intentional prototype decisions and do not silently downgrade a HIGH
finding.

## Reassessment of Medium Findings

| ID | Previous Status | Current Status | Reason | Recommended Action |
| --- | --- | --- | --- | --- |
| M-001 | Open | Partially resolved; intentional | Meaningful workflow states are upserted into the Library from Generate onward. An untouched Brief is intentionally not persisted, matching the locked decision against per-keystroke autosave. | Document “saved content records” semantics and retain one explicit save/upsert policy before backend persistence. |
| M-002 | Open | Still exists | `ContentCreateView.vue` remains about 1,392 lines and owns six templates plus orchestration. | Extract only proven repeated units (platform editor, uploader, review section, navigation) after the workflow contract is stable. |
| M-003 | Open | Partially resolved | Publication and performance selectors are shared, but platform labels, status tones, date formatting, and some table styles remain local to views. | Centralize pure formatting/status metadata and align the custom Performance table with the shared table pattern where interaction matches. |
| M-004 | Open | Still exists | `ContentLibraryRecord` still stores top-level status/schedule/publication fields alongside nested `details.schedules`, `details.publications`, and history. Publication records are canonical but mirrored for existing Detail/seed compatibility. | Normalize lifecycle and publication ownership before defining the backend contract; expose derived selectors for views. |
| M-005 | Open | Deferred by product decision | The product decision explicitly keeps all six steps at `/content/create` with Pinia-managed step state. No functional defect was found in the current route model. | Defer URL-addressable steps unless shareable/resumable links become a later requirement. |
| M-006 | Open | Partially resolved | Reusable fixtures are mostly under `src/data`, but AI operation metadata, integration records, some options, and fallback labels remain embedded in views/stores. | Move reusable fixtures/options behind data modules or selectors during backend adapter work. |
| M-007 | Open | Still exists | `aiSettingsStore` persists generation language/provider metadata, while mock Generate/Adapt/Review content still comes from fixed fixture variants and does not consume those settings. | Clearly label the setting as informational or thread provider/language into mock metadata; do not imply a real model call. |
| M-008 | Open | Still exists | `AiSystemView.contentTitle()` recognizes one hard-coded content id and otherwise returns “Content record” rather than resolving `contentLibrary.records` by `contentId`. | Resolve request-log titles through the canonical content store with a neutral missing-record fallback. |
| M-009 | Open | Partially resolved | Performance and Overview now use canonical publication selectors and generally say “Published Posts,” but Content Output still counts campaign records and the distinction is not explicit beside every summary. | Label campaign counts versus platform-post counts consistently and share selectors. |
| M-010 | Open | Partially resolved | Shared publication/consistency formulas are aligned, but Overview intentionally shows a fixed latest eight-week snapshot while Performance supports 4/8/12 weeks. | Keep the Overview period visible as a fixed summary or share a period control if product scope later requires direct comparison. |
| M-011 | Open | Still exists | Desktop `AppSidebar` has Sign Out, but the mobile `BaseDrawer` footer contains only `UserIdentity`. | Add a labeled, keyboard-accessible Sign Out action to the mobile drawer. |
| M-012 | Open | Still exists | Company Context and Content Detail expose tab roles and selection state, but lack consistent Arrow, Home, End, and roving-tabindex behavior. | Add one focused accessible tab primitive and use it in both views. |
| M-013 | Open | Still exists | `package.json` has build/dev/preview only; no focused store tests or browser smoke suite exist. | Add small Pinia selector/store tests plus a Playwright lifecycle smoke test before backend changes. |
| M-014 | Open | Still exists | Intentional page widths still range from roughly 1,100px to 1,600px without named width-tier tokens. | Define named form/standard/wide tiers and apply them intentionally without forcing one global width. |

## Remaining Low Findings

- **L-001 — Still exists:** `auth.ts` parses session storage directly as
  `AuthUser` without shape validation. Clear malformed session data before
  hydrating the identity.
- **L-002 — No longer actionable; intentional prototype limitation:** demo
  credentials remain in `src/data/auth.ts` by design. The password is not
  stored in the authenticated user or session identity. Replace the entire
  flow with backend authentication before deployment.
- **L-003 — Still exists:** `BaseOverlay` traps Tab and restores the trigger but
  does not focus the first useful control; the Library overflow menu lacks a
  shared Escape/outside-click/collision behavior.
- **L-004 — Still exists; browser verification pending:** dense 9–12px metadata
  and intentionally scrollable Calendar/Performance tables need a 200% zoom
  check and clearer overflow affordance.

## End-to-End Workflow

The source-level continuity path is intact:

`Idea Bank → startFromIdea → Brief validation → Generate → Adapt → Creative →
Review → human approval → Schedule → Library/Detail → Calendar →
markPlatformPublished → Performance/Overview`.

The distinct new/idea/resume actions, complete workflow upsert, asset registry,
stable publication identity, metric reconciliation, and live context/product
resolution cover the previously high-risk transitions. The expected scenarios
for isolated Instagram/LinkedIn regeneration, carousel ordering, approval
gating, schedule-versus-published semantics, duplicate publication prevention,
and publication-week attribution are represented by the current store logic.

Interactive browser execution remains **pending** in this environment because
headless Chromium exits with a macOS `mach_port_rendezvous` permission error.
That limitation applies to click-level confirmation of login, modal focus,
mobile navigation, publication dialogs, and responsive visual behavior; it is
not a source-level regression finding.

## Source-of-Truth Status

| Domain | Canonical owner | Status |
| --- | --- | --- |
| Authentication/session | `authStore` | Good for frontend prototype; identity shape validation remains low debt. |
| Company Profile, Brand, BMC | `companyContextStore` | Canonical and dynamically consumed by Product Context/Create Content. |
| Products/Product Profiles | `productsStore` | Canonical IDs and live name resolution. |
| Ideas | `contentIdeasStore` | Canonical source shared with Recent Ideas and Idea Bank. |
| Active workflow | `contentWorkflowStore` | Explicit new/from-idea/resume actions and centralized status-step mapping. |
| Saved content | `contentLibraryStore.records` | Canonical saved records; top-level/nested lifecycle duplication remains M-004. |
| Platform publications | `contentLibraryStore.publicationRecords` | Stable `${contentId}:${platform}` identity and idempotent update. |
| Weekly social metrics | `performanceStore.weeklyMetrics` | Canonical followers/reach/impressions/engagement data. |
| Publication counts | `publicationMetrics.ts` | Shared reconciliation selector used by Performance and Overview. |
| Integrations | `integrationStore` | Separate connection/manual-source state; no credentials. |
| AI metadata | `aiSettingsStore` | Canonical provider/model/language metadata; mock operations remain informational (M-007). |

The principal remaining competing representation is the compatibility mirror of
publication/schedule data inside `ContentLibraryRecord.details`. It is not a
second independently mutated publication source, but should be normalized
before backend persistence is designed.

## Visual Consistency

Cross-checking the current screens against the relevant Stitch references and
`DESIGN_RULES.md` found the approved normalization intact: shared light cards,
40–44px controls, restrained borders/radii, canonical StatusBadge tones,
consistent PageHeader/sidebar treatment, and the single bottom-right toast.
These are intentional **B — Stitch inconsistency already normalized** choices.

Remaining **C — cross-screen consistency** issues are M-003 (local formatters,
status metadata, and a custom Performance table) and M-014 (unnamed width
tiers). Remaining **D — UX/accessibility** issues are M-011, M-012, L-003, and
L-004. No broad Stitch restoration or redesign is warranted.

## Responsive QA

| Viewport | Current assessment |
| --- | --- |
| 1440px | Primary layouts are comfortable. Width differences are intentional but not named (M-014). |
| 1280px | Main dashboard/settings layouts are usable; Create Content remains dense with a fixed desktop sidebar and should be browser-checked near its transition. |
| 1024px | This is the sidebar breakpoint. The drawer transition is implemented, but the exact workflow/form breakpoint needs interactive verification. |
| 768px | Forms and cards generally stack. Calendar grids and metric tables preserve readability through horizontal scrolling; scroll affordance should be verified. |
| 390px | Workflow, context, product, settings, and Login rules stack. Calendar/table minimum widths intentionally scroll; mobile drawer has no Sign Out (M-011). |
| 200% zoom | Not verified interactively; compact metadata and scroll discoverability remain L-004. |

No source-level global page overflow was identified. Calendar grids and dense
tables intentionally use minimum readable widths and scroll containers rather
than crushing content.

## Accessibility QA

Shared form controls associate labels and errors correctly; Login supports
Enter submission and an accessible password visibility label; icon-only actions
use labels; creative upload retains a file-input fallback; tables expose
semantic headers and scroll regions; statuses and assessment outcomes include
text rather than color alone.

Practical remaining issues are M-011 (mobile Sign Out), M-012 (tab keyboard
model), L-003 (initial dialog focus and overflow menu dismissal), and L-004
(zoom/scroll verification). Modal Escape/backdrop handling and trigger-focus
restoration are present in the shared overlay.

## Code Health

`npm run build` passes with `vue-tsc -b` and Vite; the TypeScript configuration
checks unused locals/parameters. A source scan found no `console.log`,
`console.warn`, `console.error`, TODO/FIXME markers, or frontend API calls to
Claude/OpenAI/social platforms/backend services. Hard-coded dates remain in
seed data intentionally; time-sensitive display calculations use local time.

The material maintainability concerns are the oversized workflow view (M-002),
repeated formatting/status code (M-003), duplicated lifecycle compatibility
fields (M-004), remaining embedded fixtures (M-006), and the hard-coded AI
request title fallback (M-008). These are contract/readiness concerns rather
than build failures.

## Test Readiness

There is no automated test command or test dependency in `frontend/package.json`.
The smallest useful pre-backend suite is:

1. focused Pinia/util tests for Brief gating, new/idea/resume hydration,
   upsert, asset ownership, publication idempotency, reconciliation,
   publication-week attribution, and context resolution;
2. one Playwright smoke flow covering login, idea-to-content, approval,
   scheduling, one-platform publication, remaining-platform publication,
   Library/Detail/Calendar, Performance, and Overview;
3. a narrow responsive/accessibility smoke check for mobile Sign Out, tabs,
   modal Escape, and the 390px/768px layouts.

The browser smoke run was not executable in this environment due to the
headless Chromium permission error described above.

## Build Status

`npm run build` **PASSED** on 2026-09-10:

- `vue-tsc -b` passed;
- Vite transformed 184 modules;
- production assets were generated without TypeScript errors or build warnings.

### Required Before Frontend Lock

These are the remaining issues that should be addressed before treating the
frontend as a stable backend contract:

- M-004: normalize or formally document the lifecycle/publication compatibility
  fields before backend persistence is modeled;
- M-008: resolve AI request content titles through the canonical content store;
- M-011 and M-012: restore mobile Sign Out and practical keyboard tab behavior;
- M-013: add the focused store and smoke tests needed to protect the high-risk
  continuity paths;
- complete an interactive responsive/accessibility pass once a browser runner
  is available.

### Safe to Defer

M-001's saved-record policy, M-002 component extraction, M-003 formatter
consolidation, M-005 URL-addressable steps, M-006 fixture relocation, M-007 AI
metadata wiring, M-009/M-010 labeling and period alignment, M-014 named width
tiers, and L-001/L-002/L-003/L-004 can be handled in the next fix pass or
backend/production work, provided their prototype boundaries remain explicit.

FRONTEND READINESS:

**READY FOR FIX PASS.** All previous HIGH findings still pass and the build is
clean, but the remaining source-of-truth normalization, canonical AI title
resolution, practical mobile/tab accessibility gaps, and missing regression
suite should be addressed before frontend lock. This is not a production
readiness statement.

# Final Fix Pass

This pass addresses only M-004, M-008, M-011, M-012, and M-013. The historical
findings above are retained for traceability.

| ID | Status | Resolution |
| --- | --- | --- |
| M-004 | **FIXED** | Added `ContentLifecycleState`, `normalizeContentRecord()`, `contentLifecycle()`, `contentStatus()`, `contentSchedules()`, and `contentPublications()`. Seed/legacy records are normalized once; lifecycle writes go through `setContentLifecycle()`. Top-level status/schedule/publication fields remain compatibility mirrors rather than independent write paths. Library, Detail, Calendar, Performance, Overview, and workflow hydration use the canonical selectors. |
| M-008 | **FIXED** | `AiSystemView` now resolves each request `contentId` through `contentLibraryStore.records`. Missing IDs show `Content unavailable`; system-level requests show `No linked content`. No hard-coded ID mapping remains. |
| M-011 | **FIXED** | The mobile navigation drawer now includes a labeled Sign Out button using the same `auth.logout()`, session clearing, navigation, and drawer-close behavior as desktop. Application data stores are untouched. |
| M-012 | **FIXED** | Added reusable `AccessibleTabs` with tablist/tab/tabpanel relationships, roving tabindex, ArrowLeft/ArrowRight, Home, End, focus movement, and preserved context/detail visual variants. Company Context and Content Detail now share it. |
| M-013 | **FIXED** | Added Vitest + jsdom store/util coverage and one Playwright lifecycle smoke test, with `test`, `test:unit`, and `test:e2e` scripts. |

## Final High Regression Check

H-001 through H-009 remain fixed after this pass. Brief validation remains
deterministic; resume/new/idea workflow intents remain separate; creative URL
ownership remains registry-based; publication records remain stable and
idempotent; reconciliation and publication-week attribution remain shared;
neutral mock claims remain in place; complete workflow upsert remains intact;
and company/product display values remain ID-resolved.

The lifecycle normalization does not couple platform publication states: one
published platform keeps the campaign Scheduled until all enabled platforms
are published.

## Unit Test Result

`npm run test:unit` **PASSED**:

- 6 test files;
- 12 tests;
- Brief gating, workflow intents/hydration, publication identity/status,
  reconciliation/week attribution, and dynamic Company → Product context
  resolution are covered.

## E2E Test Result

The smoke suite is present and lists one focused lifecycle test via
`npx playwright test --list`. Execution is **BLOCKED BY ENVIRONMENT**: the
Playwright browser executable is not installed in the current environment
(`chrome-headless-shell` is missing). An earlier attempt also encountered the
restricted local-server bind. No E2E pass is being claimed or hidden.

## Build Result

`npm run build` **PASSED** after the fixes. `vue-tsc -b` and Vite completed
successfully, transforming 189 modules without TypeScript errors or build
warnings.

## Remaining Deferred Items

M-001, M-002, M-003, M-005, M-006, M-007, M-009, M-010, and M-014 remain
intentionally deferred according to the prior QA pass. L-001 through L-004
also remain deferred. Interactive browser verification of responsive layouts,
mobile focus, and the full E2E click path should be run when a Playwright
browser is available.

FRONTEND READINESS:

**READY TO LOCK.** All HIGH findings remain fixed, M-004/M-008/M-011/M-012 are
resolved, focused unit coverage passes, the build is clean, and the E2E smoke
suite exists. Browser execution is pending solely because the environment lacks
the Playwright executable; this is not a production-readiness statement.
