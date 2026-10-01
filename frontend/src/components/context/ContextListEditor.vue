<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../ui/AppIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'

const props = defineProps<{ label: string; hint?: string }>()
const items = defineModel<string[]>({ default: () => [] })
const draft = ref('')

function add() {
  const value = draft.value.trim()
  if (value && !items.value.includes(value)) items.value = [...items.value, value]
  draft.value = ''
}
function remove(index: number) { items.value = items.value.filter((_item, itemIndex) => itemIndex !== index) }
</script>

<template>
  <div class="context-list-editor">
    <div class="context-list-editor__heading"><span class="ui-field__label">{{ props.label }}</span><span v-if="hint" class="context-list-editor__hint">{{ hint }}</span></div>
    <div class="context-list-editor__input"><BaseInput v-model="draft" :label="`Add ${label.toLowerCase()}`" placeholder="Type and add" @keyup.enter="add" /><BaseButton type="button" variant="secondary" size="compact" :disabled="!draft.trim()" @click="add"><AppIcon name="plus" :size="15" />Add</BaseButton></div>
    <div v-if="items.length" class="context-chips" :aria-label="label">
      <span v-for="(item, index) in items" :key="`${item}-${index}`" class="context-chip">{{ item }}<button type="button" :aria-label="`Remove ${item}`" @click="remove(index)"><AppIcon name="close" :size="13" /></button></span>
    </div>
  </div>
</template>

<style scoped>
.context-list-editor { display: grid; align-content: start; align-self: start; gap: 14px; min-width: 0; }
.context-list-editor__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.context-list-editor__hint { color: var(--color-subtle); font-size: 12px; }
.context-list-editor__input { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
.context-list-editor__input > :first-child { width: 100%; }
.context-list-editor__input > .ui-button { align-self: flex-start; }
.context-chips { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 2px; }
.context-chip { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-control); color: var(--color-ink); background: var(--color-well); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.context-chip button { display: grid; place-items: center; flex: 0 0 auto; width: 22px; height: 22px; margin: -2px -4px -2px 0; border-radius: 6px; color: var(--color-subtle); }
.context-chip button:hover { background: var(--color-surface); color: var(--color-ink); }
.context-chip button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
</style>
