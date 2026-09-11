<script setup lang="ts">
import { nextTick, ref } from 'vue'

export interface AccessibleTabItem {
  id: string
  label: string
}

const props = withDefaults(defineProps<{
  items: readonly AccessibleTabItem[]
  modelValue: string
  label: string
  idPrefix: string
  panelPrefix: string
  variant?: 'context' | 'detail'
}>(), { variant: 'detail' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const tablist = ref<HTMLElement>()

function activate(id: string) {
  emit('update:modelValue', id)
}

async function moveFocus(index: number) {
  const count = props.items.length
  if (!count) return
  const nextIndex = (index + count) % count
  const next = props.items[nextIndex]
  activate(next.id)
  await nextTick()
  tablist.value?.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus()
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    void moveFocus(index + 1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    void moveFocus(index - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    void moveFocus(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    void moveFocus(props.items.length - 1)
  }
}
</script>

<template>
  <nav
    ref="tablist"
    class="accessible-tabs"
    :class="`accessible-tabs--${variant}`"
    role="tablist"
    :aria-label="label"
  >
    <button
      v-for="(item, index) in items"
      :id="`${idPrefix}-${item.id}`"
      :data-tab-id="item.id"
      :key="item.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.id"
      :aria-controls="`${panelPrefix}-${item.id}`"
      :tabindex="modelValue === item.id ? 0 : -1"
      @click="activate(item.id)"
      @keydown="onKeydown($event, index)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>

<style scoped>
.accessible-tabs { display: flex; max-width: 100%; overflow-x: auto; gap: 4px; }
.accessible-tabs button { flex: 0 0 auto; min-height: 36px; white-space: nowrap; }
.accessible-tabs--context { padding: 4px; border-radius: var(--radius-card); background: var(--color-well); }
.accessible-tabs--context button { padding: 8px 16px; border-radius: var(--radius-control); color: var(--color-muted); font-size: 13px; }
.accessible-tabs--context button[aria-selected='true'] { background: var(--color-surface); color: var(--color-ink); font-weight: 600; box-shadow: var(--shadow-popover); }
.accessible-tabs--detail { padding: 4px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.accessible-tabs--detail button { padding: 0 14px; border-radius: 6px; color: var(--color-muted); font-size: 13px; font-weight: 500; }
.accessible-tabs--detail button:hover { background: var(--color-well); color: var(--color-text); }
.accessible-tabs--detail button[aria-selected='true'] { background: var(--color-primary); color: white; }
.accessible-tabs button:focus-visible { outline: 3px solid rgb(29 78 216 / .2); outline-offset: 1px; }
</style>
