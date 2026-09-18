# Shifd Marketing frontend

Phase 12 integration artifact: Vue 3, TypeScript, Vite, Vue Router, Pinia, and Tailwind CSS. The locked frontend-v1 visual system is connected to the Phase 1–11 backend through typed domain adapters. Session authentication uses the backend HttpOnly cookie; CSRF tokens and canonical resource ETags remain runtime-only.

## Run

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Set public frontend configuration in `.env` when needed:

```sh
VITE_API_BASE_URL=/api
VITE_DEV_BACKEND_URL=http://127.0.0.1:3000
```

`VITE_API_BASE_URL` defaults to same-origin `/api`; `VITE_DEV_BACKEND_URL` is used only by the Vite development proxy. Do not put secrets in `VITE_*` variables. Run the backend and PostgreSQL separately for real workflow use. The build runs TypeScript checking before producing `dist/`. Production hosting must serve `index.html` for application paths because routing uses HTML5 history.

## Structure

- `src/router/navigation.ts`: navigation groups and the locked route definitions. `src/router/index.ts` supplies lazy views, protected-route authentication, breadcrumbs, document titles, history/scroll behavior, and not-found recovery.
- `src/components/app/`: persistent shell, shared navigation/header, identity, page container/header/breadcrumbs, and toast region. The sidebar stays mounted while navigating; below 1024px navigation uses a drawer.
- `src/components/ui/`: buttons/icons, cards, labeled inputs/selects/textareas, checkbox, badges, alerts, empty state, table, modal/drawer, and stepper primitives.
- `src/api/`: shared HTTP client plus typed domain adapters for auth, context, ideas, content, assets, review, scheduling, performance, integrations, and AI settings.
- `src/stores/`: Pinia stores for canonical API data, loading/error state, UI state, and ephemeral workflow drafts. Legacy files under `src/data/` remain only as isolated compatibility/test fixtures; they are not runtime business-data sources.
- `src/style.css`: canonical design tokens and shared styles, exposed through Tailwind's theme. Inter and SVG identity assets are local; no font CDN is required.
- `src/views/`: a metadata-driven placeholder and a not-found page. Introduce business views in later approved phases without rebuilding the shell.

## Component conventions

Use `BaseButton` for actions and `RouterLink` for navigation. Links can share `ui-button`, `ui-button--secondary`, and `ui-control--default` styles. Icon-only actions use `IconButton` with a required accessible `label`.

`BaseInput`, `BaseSelect`, and `BaseTextarea` accept `v-model`, a required `label`, optional `hint`/`error`, and native control attributes. Each generates a unique ID and connects its label and description. `BaseSelect` options have `{ value, label, disabled? }`; use explicit `required` only when product requirements establish it. Input model values support strings/numbers, including an empty string when a numeric field is cleared.

`BaseCard` supports header/actions/footer slots. `StatusBadge` accepts a presentation `tone` and optional `dot`; its text comes from the caller. It does not decide lifecycle or approval status. `InlineAlert` supplies semantic feedback, while `useUiStore().notify(message, tone)` creates a dismissible global notification. Important dialog feedback should remain inside the dialog rather than behind its modal layer.

`BaseModal` and `BaseDrawer` use a Boolean `v-model`, required title, optional description, default body slot and footer slot. Native modal dialogs contain keyboard focus and make the background inert. They support Escape/backdrop dismissal, focus return, and shared body-scroll locking. `dismissible="false"` must be bound as `:dismissible="false"`; use it only while an action truly cannot be dismissed. Modal sizes are 480/560px; editor drawers are 480px and the mobile navigation drawer is 280px.

`BaseTable` accepts a caption, keyed columns and rows with stable IDs. Customize cells through `#cell-columnKey="{ row, value }"`; set column `align: 'right'` for tabular metrics. It handles loading/empty rows and keyboard-accessible horizontal scrolling. Sorting, filtering, pagination and business selection belong to later screen requirements.

`Stepper` receives `steps`, `current`, and an accessible label. It is display-only by default; enabling `interactive` emits `select` for available steps. It does not perform routing, validate workflow gates, or grant approval.

## Verification

Run `npm run test` and `npm run build`. The optional Playwright script is `npm run test:e2e`; it is not part of the locked passing gate. Check the requested routes and direct refreshes; Ideas/Create must resolve ahead of content detail IDs. Verify one selected item in the primary navigation, parent selection for detail views, browser history, and unknown-path recovery. At desktop/tablet/mobile widths, check for horizontal overflow, drawer keyboard containment, Escape/close/backdrop dismissal, and focus return. Integration coverage and known environment limitations are recorded in [Phase 12 integration notes](../docs/PHASE_12_FRONTEND_BACKEND_INTEGRATION.md); the visual standard remains in the [design decisions](../docs/DESIGN_DECISIONS.md).
