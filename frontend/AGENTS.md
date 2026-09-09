# Frontend Instructions

## Stack

Use:

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- Tailwind CSS

Use Vue Composition API.

Prefer:

<script setup lang="ts">

---

## Architecture

Prefer this structure:

src/
├── components/
│   ├── app/
│   ├── ui/
│   ├── content/
│   ├── context/
│   └── performance/
│
├── views/
├── router/
├── stores/
├── data/
├── types/
├── composables/
└── services/

---

## Mock Data

Current phase uses mock data only.

Store mock data separately:

src/data/

Do not hard-code large dummy datasets directly in Vue templates.

Define domain models in:

src/types/

Structure frontend models so they can later map naturally to backend API entities.

---

## UI Components

Build reusable components for repeated UI patterns.

Examples:

- AppSidebar
- AppHeader
- PageHeader
- BaseButton
- BaseInput
- BaseTextarea
- BaseSelect
- BaseCard
- StatusBadge
- BaseModal
- EmptyState
- Stepper
- FileUpload

Do not create one-off duplicates if a reusable component already exists.

---

## Stitch References

For every page implementation:

1. inspect screen.png
2. inspect code.html
3. inspect related screens for shared patterns

The Stitch HTML is reference material only.

Reimplement the design idiomatically in Vue.

---

## Quality

After implementation:

- run npm run build
- fix TypeScript errors
- preserve existing functionality
- verify responsive behavior
- avoid unnecessary dependencies