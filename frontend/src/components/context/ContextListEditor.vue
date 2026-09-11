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
