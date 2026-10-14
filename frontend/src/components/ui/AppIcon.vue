<script setup lang="ts">
import type { IconName } from '../../types/ui'

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 })

const paths: Record<IconName, string[]> = {
  overview: ['M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  idea: ['M9 18h6 M10 21h4 M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7v1H8z'],
  sparkles: [
    'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M3 2v4 M1 4h4 M20 18v4 M18 20h4',
  ],
  library: ['M7 3h14v16H7z M3 7v14h14 M10 7h8 M10 11h8 M10 15h5'],
  calendar: [
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M7 3v4 M17 3v4 M3 10h18 M7 14h2 M13 14h2 M7 17h2',
  ],
  chart: ['M3 17 9 11l4 3 8-10 M16 4h5v5 M3 21h18'],
  linkedin: ['M4 4h16v16H4z M8 10v6 M8 7h.01 M12 16v-6 M12 12a2 2 0 0 1 4 0v4'],
  company: [
    'M4 21V3h11v18 M15 9h5v12 M2 21h20 M8 7h3 M8 11h3 M8 15h3 M8 21v-3h3v3',
  ],
  product: ['m3 7 9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l9 4'],
  integrations: [
    'M8 12h8 M12 8v8',
    'M9 3h6v5H9z M9 16h6v5H9z M3 9h5v6H3z M16 9h5v6h-5z',
  ],
  system: [
    'M9 3H6v3H3v4l2 2-2 2v4h3v3h3 M15 3h3v3h3v4l-2 2 2 2v4h-3v3h-3 M9 7v10 M15 7v10 M9 12h6',
  ],
  search: ['M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4 M12 1v1'],
  help: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',
  ],
  settings: ['M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6'],
  menu: ['M4 6h16 M4 12h16 M4 18h16'],
  close: ['m6 6 12 12 M6 18 18 6'],
  'chevron-right': ['m9 5 7 7-7 7'],
  'arrow-left': ['M20 12H4 m7-7-7 7 7 7'],
  'arrow-right': ['M4 12h16 m-7-7 7 7-7 7'],
  check: ['m5 12 4 4L19 6'],
  circle: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 11v6 M12 7h.01'],
  alert: ['m12 3 10 18H2z M12 9v5 M12 17h.01'],
  plus: ['M12 5v14 M5 12h14'],
  edit: ['M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z'],
  copy: ['M8 8h12v13H8z M16 8V3H4v13h4'],
  archive: ['M3 4h18v4H3z M5 8v12h14V8 M10 12h4'],
  trash: ['M3 6h18 M8 6V4h8v2 M19 6l-1 15H6L5 6 M10 11v6 M14 11v6'],
  upload: ['M12 16V3 m-5 5 5-5 5 5 M4 15v6h16v-6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  link: ['M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7 M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7'],
  lock: ['M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3'],
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="app-icon"
  >
    <path v-for="(path, index) in paths[name]" :key="index" :d="path" />
  </svg>
</template>
