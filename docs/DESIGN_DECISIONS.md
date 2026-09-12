# Design Decisions

This document records meaningful deviations from the Google Stitch references
made to improve usability and cross-screen consistency.

## Phase 1 — Frontend foundation (2026-09-09)

The implementation plan was approved, followed by explicit authorization to implement the foundation only. These decisions apply to the shared shell and placeholder screens. They do not resolve the plan's business-page, lifecycle, approval, or integration questions.

### 1. One shared sidebar and route-derived selection

- **Affected screens:** all shell references, particularly Ideas, Company, Products, Calendar, Library, and AI & System.
- **Original inconsistency:** several exports highlight Create Content on unrelated pages; Library shows two active items; some screens omit navigation icons. Precision Executive prose specifies a 240px sidebar while the screen HTML consistently uses 256px.
- **Chosen implementation:** a persistent 256px desktop sidebar with the existing five groups, consistent outline icons, and one active primary-navigation item derived from route metadata. Content and product detail placeholders retain their respective parent selections. Below 1024px, the same navigation appears in a keyboard-accessible drawer; desktop and mobile share one navigation configuration.
- **Reason:** matches the majority screen structure and the approved canonical pattern while correcting selection errors and making navigation usable on narrow screens.

### 2. Shared header, content bounds, and responsive spacing

- **Affected screens:** all references; especially the compressed Ideas/Performance headers and variable Detail/Integrations/Brand Kit page widths.
- **Original inconsistency:** repeated workspace logos and a fixed “Execution Engine” label duplicate the sidebar identity; breadcrumbs differ by page. Page widths and spacing below the fixed header vary and occasionally clip content.
- **Chosen implementation:** one 64px sticky workspace header, identity/logo in the sidebar, route-derived breadcrumbs in the page header, a 1600px main-container cap, 24px desktop gutters and 16px gutters below 1024px. Titles and actions wrap. Header tools simplify as space narrows; scrollbars remain available.
- **Reason:** maintains the workspace hierarchy without duplicate branding, clipped titles, or inconsistent offsets. The header does not claim a live execution engine.

### 3. Canonical surface, type, and control tokens

- **Affected screens:** all references and `precision_executive/DESIGN.md`.
- **Original inconsistency:** warm versus cool palettes, 24/32px page headings, 700-weight text, shadowed versus outlined cards, and redefined radius names. Controls range from 32–44px with inconsistent focus treatment.
- **Chosen implementation:** cool `#F8F9FF` canvas, white cards, `#EFF4FF` wells, `#0B1C30` text, `#1D4ED8` primary actions, restrained borders, and no resting card shadows. Inter is bundled locally in weights 400/500/600. Page headings use 32/40px; semantic type/radius/color tokens are shared through Tailwind. Default controls are 36px, compact controls 32px, and comfortable controls 40px. Coarse-pointer icon and navigation targets are at least 44px. All interactive primitives have visible focus treatment.
- **Reason:** follows the approved plan's majority palette and shared hierarchy, with accessible control states and fewer one-off styles. No screenshot contrast or compliance certifications are asserted.

### 4. Accessible overlays, tables, status, and stepper foundations

- **Affected screens:** Ideas drawer, Calendar confirmation modal, AI simulation modal, Library/Overview/Performance tables, Brief and Creative steppers.
- **Original inconsistency:** disparate modal shapes and native alerts, incomplete keyboard/focus handling, clipped tables with hidden scrollbars, varying badge semantics, and a Creative stepper that clips later steps.
- **Chosen implementation:** shared native-dialog-based modal/drawer primitives with labeled headings, focus containment/return, Escape/backdrop dismissal, and shared scroll locking. Tables retain semantic markup and visible horizontal scrolling. StatusBadge exposes consistent neutral/info/success/warning/danger presentation without assigning lifecycle or approval. Stepper accepts labeled steps and explicit completion/disabled state, with reachable horizontal navigation and a position track. These are generic primitives; no business table, approval dialog, or functioning content wizard is implemented yet.
- **Reason:** establishes reusable accessible patterns without reproducing generated DOM scripts or making product-state decisions.

### 5. Local identity assets and honest placeholder controls

- **Affected screens:** shared sidebar/header in all exports.
- **Original inconsistency:** generated logo and portrait assets rely on remote Google URLs; header search implies campaign search, and controls imply live notifications/help without specified behavior.
- **Chosen implementation:** a local SVG mark follows the blue rounded-square/directional motif; an initials avatar represents the supplied mock Reza identity. Search, notification, and help affordances are explicitly disabled and labeled “coming soon.” Each requested route presents a titled placeholder with no fabricated operational metrics or business actions.
- **Reason:** keeps the foundation self-contained and avoids implying unsupported functionality. Final supplied brand/portrait assets can replace the local assets later without changing the shell.

### 6. User-specified route contract supersedes proposed URLs

- **Affected screens:** Overview, Create Content, Content Library, content/product details, and AI & System.
- **Original inconsistency:** the approved planning document proposed `/overview`, `/content/new`, `/content/library`, a selected product query, and `/settings/ai-system`.
- **Chosen implementation:** use the user's Phase 1 route list exactly: `/`, `/content/ideas`, `/content/create`, `/content`, `/content/:id`, `/calendar`, `/performance`, `/context/company`, `/context/products`, `/context/products/:id`, `/settings/integrations`, and `/settings/ai`. Unknown paths have a recoverable not-found view within the same shell. Shared placeholder composition avoids duplicating twelve unfinished pages.
- **Reason:** the latest explicit user instruction defines the route contract. Additional workflow and company-child routes remain outside this phase.

## Create Content — Brief step (2026-09-09)

### 7. Local context anchor and honest generation placeholder

- **Affected screen:** `/content/create`, Step 1 Brief and its Step 2 transition.
- **Original inconsistency:** the Stitch brief uses a remote context image and presents a live knowledge-graph state, while this phase is explicitly mock-only and cannot claim a connected context engine.
- **Chosen implementation:** use a local CSS context illustration with a “Local mock context” status, keep the product and context controls fully interactive, and transition to an in-app Step 2 placeholder after saving the brief. No remote image, backend request, or AI generation call is made.
- **Reason:** preserves the visual role of the reference panel and the six-step workflow while keeping the screen honest about the available data and behavior.

### 8. Shared workflow and form primitives

- **Affected screen:** `/content/create`, Step 1 Brief.
- **Original inconsistency:** the generated form mixes one-off controls, spacing, and button treatments with later workflow references.
- **Chosen implementation:** use the foundation `Stepper`, `BaseCard`, `BaseInput`, `BaseSelect`, `BaseTextarea`, `StatusBadge`, and `InlineAlert` primitives, with one responsive two-column workbench and a sticky action bar. Radio choices and quick-add suggestions share the same focus, selected, and disabled states.
- **Reason:** keeps the first workflow step consistent with the approved foundation and gives later Adapt, Creative, Review, and Schedule screens a stable visual contract.

### 9. Product-grounded inspector replaces generated scoring and claims

- **Affected screen:** `/content/create`, Step 1 Brief right-side inspector.
- **Original inconsistency:** the Stitch panel called itself a Context Anchor but displayed unsupported GovTech classifications, confidence percentages, case-study performance claims, and an AI-like Brief Quality Score.
- **Chosen implementation:** rename the panel to Active Context and show only the selected product, inherited Shifd Labs context, audience, objective, and approved value proposition. Replace scoring with Brief Readiness, a deterministic required-field checklist. Replace Recent Product Angles with clickable Recent Ideas from the mock Content Idea Bank, plus a View all ideas affordance.
- **Reason:** keeps the inspector useful during brief creation while aligning its content with the approved product specification and avoiding invented AI evaluation or business claims.

## Create Content — Generate step (2026-09-09)

### 10. Generate uses editable local drafts and direction-only visuals

- **Affected screen:** `/content/create`, Step 2 Generate.
- **Original inconsistency:** related Stitch workflow exports mix generated copy, visual production instructions, and final creative assets in one dense screen, while the product rules reserve image production for the later Creative step.
- **Chosen implementation:** split Generate into a Content Draft card with inline editable Title, Core Message, Hook, Body, and CTA fields and a Visual Direction card containing format, concept, slide structure, and notes. Regenerate switches between two local mock variants; it never calls an AI or backend service. Continue advances only to a clearly labeled Adapt placeholder, and Back to Brief keeps the existing reactive form state.
- **Reason:** preserves the six-step workflow and Stitch visual language while making the boundary between generated copy, visual direction, and later external Canva/PNG/JPG production explicit.

## Create Content — Adapt step (2026-09-09)

### 11. Side-by-side platform adaptation cards

- **Affected screen:** `/content/create`, Step 3 Adapt.
- **Original inconsistency:** related Stitch exports place Instagram and LinkedIn content in tabbed or later creative-specific panels, with controls that imply synchronized assets and platform diagnostics. The approved workflow requires editable copy adaptations before Creative.
- **Chosen implementation:** show independent Instagram and LinkedIn cards side by side on desktop, each with editable platform copy, CTA, hashtags, and visual recommendation. Each platform has its own local regeneration variant and enable/disable control; the Continue action remains disabled if both platforms are disabled. Visuals remain recommendations only and no publishing, performance, or confidence state is introduced.
- **Reason:** makes platform differences comparable, preserves independent edits and regeneration, and keeps the Adapt step aligned with the product boundary between copy adaptation and external Creative production.

## Create Content — Creative step (2026-09-09)

### 12. Browser-local creative workspace

- **Affected screen:** `/content/create`, Step 4 Creative.
- **Original inconsistency:** the Stitch Creative Assets reference includes external design-tool affordances, automated validation language, and platform asset behavior that could imply integrations or generated media.
- **Chosen implementation:** keep the Visual Brief and manual Design Status together, provide local PNG/JPG drag-and-drop previews with ordering and removal, and let LinkedIn inherit Instagram previews or use a separate local upload. Object URLs remain in browser memory only; Ready validation checks enabled platforms without introducing image scoring or cloud persistence.
- **Reason:** follows the implementation boundary that final visuals are produced externally and uploaded manually, while keeping the prototype lightweight and stateful during the current browser session.

## Create Content — Review step (2026-09-09)

### 13. Advisory assessment and explicit human approval gate

- **Affected screen:** `/content/create`, Step 5 Review.
- **Original inconsistency:** the Stitch audit reference presents verification, telemetry, cryptographic states, and approved copy as if automated systems can finalize the content decision.
- **Chosen implementation:** show separate Instagram and LinkedIn advisory Brand Assessments with deterministic mock scores and checks, expose manual editing, re-check, regeneration, and justification-based overrides, then gate Approve Content on human checklist completion, creative readiness, resolved re-check states, and warning justifications. Approval records the named human reviewer and timestamp, then offers Continue to Schedule without publishing.
- **Reason:** follows the product rule that AI assessments are advisory and final approval is always human, while keeping the review workspace readable and operational rather than analytics-heavy.

## Create Content — Schedule step (2026-09-09)

### 14. Local schedule handoff instead of publishing automation

- **Affected screen:** `/content/create`, Step 6 Schedule.
- **Original inconsistency:** the Stitch calendar reference combines scheduling, calendar management, and manual publication logging in a larger execution workspace, while the Create Content workflow needs a lightweight completion step.
- **Chosen implementation:** show a compact approved-content summary, per-platform date/time controls with an optional shared schedule, local future-date validation, and a scheduled success state. Scheduling records only local frontend state and provides navigation to the existing Calendar route; no social platform publishing, notification, background job, or backend persistence is implied.
- **Reason:** completes the approved workflow with a clear publication handoff while preserving the product rule that publishing remains manual.

## Create Content — Workflow architecture review (2026-09-09)

- **Affected screens:** `/content/create`, Steps 1–6.
- **Original inconsistency:** the completed workflow kept cross-step state, mock content, and repeated creative/review markup inside one view, which made state transitions and platform-specific behavior harder to audit.
- **Chosen implementation:** keep the approved visual structure unchanged while moving workflow state into a focused Pinia store, reusable mock content into `src/data/contentBrief.ts`, domain models into `src/types/content.ts`, and repeated visual patterns into shared content components.
- **Reason:** provides a stable replacement point for future API data and reduces the risk of losing edits while navigating between workflow steps without introducing a new product interaction.

## Content Library — compact local record manager (2026-09-09)

- **Affected screen:** `/content`.
- **Original inconsistency:** the Stitch reference presents repository analytics, unsupported content claims, and a large inspection drawer alongside a dense table.
- **Chosen implementation:** keep the library focused on lifecycle management with a compact summary, searchable/filterable semantic table, shared status badges, and local Open, Continue Editing, Duplicate, and Archive actions. The page uses the canonical cool surfaces, restrained borders, and responsive horizontal table scrolling.
- **Reason:** preserves the central-library information architecture while avoiding unsupported analytics or claims and keeping the page useful at the current mock-data stage.

## Content Detail — lifecycle record instead of system telemetry (2026-09-09)

- **Affected screen:** `/content/:id`.
- **Original inconsistency:** the Stitch detail reference centers cryptographic audit labels, inference telemetry, unsupported proof points, and generated performance claims while compressing the actual content record.
- **Chosen implementation:** retain the reference's record-oriented hierarchy and audit trail, but organize the approved product data into Overview, platform, Creative, and Review History tabs. AI Brand Assessment remains advisory and visually separate from human approval, while schedule and publication records explicitly describe manual publishing.
- **Reason:** makes the page a readable source of truth for the approved lifecycle without implying unsupported security, analytics, generation, or publishing capabilities.

## Content Calendar — derived manual-publication workspace (2026-09-10)

- **Affected screen:** `/calendar`.
- **Original inconsistency:** the Stitch reference prioritizes cadence scores, execution telemetry, “publish” controls, immutable audit language, and performance-like progress cards that imply an automated publishing system.
- **Chosen implementation:** derive Month and Week entries directly from each platform schedule in the canonical content records. Selecting an entry opens a compact manual-publication workspace with approved copy and creative previews; “Mark as Published” records a human-confirmed publication without calling a social platform.
- **Reason:** preserves the operational calendar and manual-release intent while following the product boundary that Shifd Marketing plans publication but never posts automatically.

## Content Ideas — human-led working backlog (2026-09-10)

- **Affected screens:** `/content/ideas`, Step 1 Recent Ideas, and Content Detail source metadata.
- **Original inconsistency:** Stitch uses resonance scores, repository analytics, platform recommendations, “Used / In Pipeline” labels, unsupported product claims, and the wrong active sidebar entry.
- **Chosen implementation:** retain the compact table with the established shell, controls, and status badges. Use All / Ready / Used / Archived filter tabs with live counts, lightweight context/product/pillar/objective filters, and one accessible Add/Edit modal. Replace scoring and platform columns with the requested context and audience metadata. Tables scroll horizontally on small screens; controls wrap. Explicit row actions remain visible and keyboard-accessible. Archive is reversible and needs no destructive confirmation.
- **Reason:** the Idea Bank is a place for people to capture and reuse ideas; it does not evaluate ideas or recommend channels. Current product requirements take precedence over unsupported reference features.
- **Workflow integration:** the bank and Brief Recent Ideas read the same Pinia store. Selecting a Ready idea starts a fresh Brief with copied inputs and no generation. It becomes Used only on an explicit Generate Content action with complete Brief fields. Editing or archiving the source idea never edits content copy. `ideaId` is recorded on scheduled content and shown as Source Idea in Content Detail. Each workflow has its own ID so later ideas cannot replace earlier scheduled records; repeated synchronization preserves publication and archive state for unchanged schedules.
- **Prototype limits:** records and ideas remain in memory and reset on refresh. The existing workflow creates a canonical Library record at Schedule; until then a Used idea has no View Related Content link. An idea stores its latest related content ID; content records retain their individual source idea IDs. Starting another idea replaces the current unfinished workflow, while already scheduled records remain available. Multi-draft persistence and one-to-many idea history are future work.

## Company Context — canonical business context workspace (2026-09-10)

- **Affected screens:** `/context/company`, Create Content Step 1 Active Context.
- **Original inconsistency:** the Stitch Company, BMC, and Brand references present AI grounding scores, cryptographic/compliance claims, unsupported performance claims, and separate navigation-like workspaces for related context concepts.
- **Chosen implementation:** provide one Company Context route with Company Profile, Business Model Canvas, and Brand tabs. Profile and brand use shared form controls with editable list chips; BMC retains all nine blocks as simple multiline entries. Save Changes commits one typed context snapshot to a focused Pinia store. Context completeness reports only whether required sections contain values. Company-mode Brief Active Context reads the saved company profile and brand-derived value from that store.
- **Reason:** keeps company information, business-model structure, and communication rules distinct while giving future Product Context a stable inheritance source. It avoids implying AI scoring, verified claims, synchronization, or product-level information in the company profile.
- **Prototype limits:** context is local in-memory state and resets on refresh, consistent with the current frontend-only architecture. Product Context remains a separate future layer; no product editor or automatic inheritance behavior is introduced here.

## Products — layered product context (2026-09-10)

- **Affected screens:** `/context/products`, `/context/products/:id`, Create Content Step 1 Active Context, and Idea Bank product selectors.
- **Original inconsistency:** the Stitch product references mix product setup with unsupported claims, market metrics, and duplicated company or brand fields. Product Context also needs to remain distinct from the Company Context workspace.
- **Chosen implementation:** use one typed Products Pinia store for product records and `ProductProfile` records. Product Context edits product-specific audience, value, marketing, and optional tone override fields. Company profile and brand values are resolved dynamically through `resolveProductContext()` and are shown as inherited, non-editable context. Product selectors in Brief, Idea Bank, and Library use canonical product IDs.
- **Reason:** preserves the Multi-Context Profile Engine layering while allowing product-specific guidance without copying or drifting from Company Context. The UI stays consistent with the existing restrained cards, forms, badges, and responsive layout.
- **Meaningful deviation:** when a product tone override is enabled, the page explicitly shows both the inherited Company Brand Voice and the resolved Product Brand Voice so the override remains transparent. The top summary labels the override rather than repeating the same text.
- **Prototype limits:** product records and profiles are local in-memory state and reset on refresh. Existing legacy content fixtures may still carry display-only product labels; records created or synchronized by the workflow retain `productId` and resolve names from the canonical store.

## Performance — observed metrics and manual publication tracking (2026-09-10)

- **Affected screen:** `/performance` and the LinkedIn metrics placeholder route.
- **Original inconsistency:** the Stitch Performance reference presents cadence scores, “verified” audience claims, GovTech exposure language, and publishing-style controls alongside large analytics cards.
- **Chosen implementation:** provide compact KPI cards, deterministic period and platform filters, lightweight SVG trend charts, posting consistency against a two-post weekly target, execution counts derived from Content Library records, and supplementary WhatsApp inquiry counts. The page explicitly labels current values as local mock data and keeps LinkedIn entry manual.
- **Reason:** reports observable execution and platform metrics without presenting a synthetic Brand Awareness score, causal AI claims, unique cross-platform reach, or automatic publishing behavior. The chart dependency remains zero because the two trend visualizations are small, typed SVG primitives shared by the page.
- **Prototype limits:** seeded weekly metrics live in a focused Pinia store and reset on refresh. Historic mock metrics supplement publication records; manually recorded Calendar publications are included in period/platform totals where available. LinkedIn manual entry remains local-only until a persistence layer is approved.

## LinkedIn Metrics — manual evidence workspace (2026-09-10)

- **Affected screen:** `/performance/linkedin`.
- **Original inconsistency:** the Stitch Performance reference presents LinkedIn values as if they were automatically synchronized and mixes source/provenance with analytics and publishing controls.
- **Chosen implementation:** use a focused add/edit modal with required week dates and metrics, calculated engagement rate, duplicate-week validation, a compact records table, and optional browser-local screenshot evidence. Records are saved with `source: linkedin_manual` into the same Pinia performance store consumed by `/performance`.
- **Reason:** makes manual research entry explicit and traceable while preserving the canonical metric formula and keeping evidence secondary. No OCR, API synchronization, scoring, or automatic publication is implied.
- **Prototype limits:** screenshots use object URLs and disappear on refresh; the future LinkedIn manual-entry surface can replace this local form without changing the `WeeklyMetric` model or Performance calculations.

## Overview — canonical aggregation dashboard (2026-09-10)

- The Overview route uses the existing Content Library, Performance, Idea Bank,
  Company Context, and Product stores as its only sources of data. KPI cards,
  attention items, upcoming schedules, and recent publications are computed at
  render time rather than maintained as a second dashboard dataset.
- The dense Stitch command-center treatment was normalized into a restrained
  set of reusable cards and compact lists. Unsupported automation, predictive
  claims, and AI recommendations were omitted; calendar readiness is derived
  from the local schedule and current browser time.
- Posting consistency and engagement rate share the deterministic helpers used
  by Performance. The prototype remains in-memory, so a browser refresh resets
  session-created records according to the existing store behavior.

## Integrations — source configuration without credentials (2026-09-10)

- The Integrations route presents only the approved Instagram, LinkedIn, and
  WhatsApp Business data sources. The Stitch reference was normalized to remove
  token vaults, OAuth controls, unsupported CRM channels, automatic publishing,
  and fabricated ingestion metrics.
- Instagram connection and sync controls are local demonstrations only. Sync
  updates the last-sync timestamp without changing Performance metrics;
  disconnecting preserves all recorded history. LinkedIn and WhatsApp remain
  clearly marked as manual entry sources, with LinkedIn linking to the existing
  canonical metrics workspace.

## Login — internal frontend prototype (2026-09-10)

- The Login route is rendered outside AppShell so unauthenticated users see a
  focused internal sign-in surface. It uses one demo credential pair and stores
  only the mock user identity in session storage; no password, token, or secret
  is retained in auth state.
- Route guards redirect unauthenticated navigation to `/login` and return an
  authenticated user to `/`. Sign out clears only the auth session, preserving
  content, context, idea, calendar, and performance stores. This is navigation
  protection for the prototype, not production authentication or security.
