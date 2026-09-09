# Shifd Marketing frontend

Phase 1 foundation: Vue 3, TypeScript, Vite, Vue Router, Pinia, and Tailwind CSS. Business pages are placeholders. There are no backend, authentication, AI, or social API calls. Workspace identity and UI state are local and in-memory.

## Run

```sh
npm install
npm run dev
npm run build
npm run preview
```

Use Node.js 20.19+ or a compatible newer version supported by the installed Vite release. The build runs TypeScript checking before producing `dist/`. Production hosting must serve `index.html` for application paths because routing uses HTML5 history.

## Structure

- `src/router/navigation.ts`: navigation groups and the twelve requested route definitions. `src/router/index.ts` supplies lazy placeholder views, breadcrumbs, document titles, history/scroll behavior, and not-found recovery.
- `src/components/app/`: persistent shell, shared navigation/header, identity, page container/header/breadcrumbs, and toast region. The sidebar stays mounted while navigating; below 1024px navigation uses a drawer.
- `src/components/ui/`: buttons/icons, cards, labeled inputs/selects/textareas, checkbox, badges, alerts, empty state, table, modal/drawer, and stepper primitives.
- `src/stores/`: workspace identity/mobile navigation and global toast state. `src/data/` contains the small workspace fixture; `src/types/` defines shared contracts.
- `src/style.css`: canonical design tokens and shared styles, exposed through Tailwind's theme. Inter and SVG identity assets are local; no font CDN is required.
- `src/views/`: a metadata-driven placeholder and a not-found page. Introduce business views in later approved phases without rebuilding the shell.

## Component conventions

Use `BaseButton` for actions and `RouterLink` for navigation. Links can share `ui-button`, `ui-button--secondary`, and `ui-control--default` styles. Icon-only actions use `IconButton` with a required accessible `label`.

`BaseInput`, `BaseSelect`, and `BaseTextarea` accept `v-model`, a required `label`, optional `hint`/`error`, and native control attributes. Each generates a unique ID and connects its label and description. `BaseSelect` options have `{ value, label, disabled? }`; use explicit `required` only when product requirements establish it. Input model values support strings/numbers, including an empty string when a numeric field is cleared.

`BaseCard` supports header/actions/footer slots. `StatusBadge` accepts a presentation `tone` and optional `dot`; its text comes from the caller. It does not decide lifecycle or approval status. `InlineAlert` supplies semantic feedback, while `useUiStore().notify(message, tone)` creates a dismissible global notification. Important dialog feedback should remain inside the dialog rather than behind its modal layer.

`BaseModal` and `BaseDrawer` use a Boolean `v-model`, required title, optional description, default body slot and footer slot. Native modal dialogs contain keyboard focus and make the background inert. They support Escape/backdrop dismissal, focus return, and shared body-scroll locking. `dismissible="false"` must be bound as `:dismissible="false"`; use it only while an action truly cannot be dismissed. Modal sizes are 480/560px; editor drawers are 480px and the mobile navigation drawer is 280px.

`BaseTable` accepts a caption, keyed columns and rows with stable IDs. Customize cells through `#cell-columnKey="{ row, value }"`; set column `align: 'right'` for tabular metrics. It handles loading/empty rows and keyboard-accessible horizontal scrolling. Sorting, filtering, pagination and business selection belong to later screen requirements.

`Stepper` receives `steps`, `current`, and an accessible label. It is display-only by default; enabling `interactive` emits `select` for available steps. It does not perform routing, validate workflow gates, or grant approval.

## Verification for future changes

Run `npm run build`. Check the requested routes and direct refreshes; Ideas/Create must resolve ahead of content detail IDs. Verify one selected item in the primary navigation, parent selection for detail views, browser history, and unknown-path recovery. At desktop/tablet/mobile widths, check for horizontal overflow, drawer keyboard containment, Escape/close/backdrop dismissal, and focus return. Business-page requirements remain in the [implementation plan](../docs/FRONTEND_IMPLEMENTATION_PLAN.md); implemented visual standardizations are recorded in [design decisions](../docs/DESIGN_DECISIONS.md).
