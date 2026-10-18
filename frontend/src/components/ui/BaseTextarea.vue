<script setup lang="ts">
import { nextTick, onMounted, ref, useId, watch } from 'vue'
import FormField from './FormField.vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    id?: string
    label: string
    hint?: string
    error?: string
    tooltip?: string
    number?: number
    required?: boolean
    rows?: number
    autoResize?: boolean
    maxHeight?: number
  }>(),
  { rows: 4, autoResize: false, maxHeight: 700 },
)
const model = defineModel<string>({ default: '' })
const generatedId = useId()
const textarea = ref<HTMLTextAreaElement | null>(null)

function resizeToContent() {
  if (!props.autoResize || !textarea.value) return
  const element = textarea.value
  element.style.height = 'auto'
  const height = Math.min(element.scrollHeight, props.maxHeight)
  element.style.height = `${height}px`
  element.style.overflowY = element.scrollHeight > props.maxHeight ? 'auto' : 'hidden'
}

watch(() => model.value, async () => {
  await nextTick()
  resizeToContent()
})

onMounted(() => {
  resizeToContent()
})
</script>

<template>
  <FormField
    :id="id ?? generatedId"
    :label="label"
    :hint="hint"
    :error="error"
    :tooltip="tooltip"
    :number="number"
    :required="required"
    v-slot="{ describedBy }"
  >
    <textarea
      v-bind="$attrs"
      :id="id ?? generatedId"
      v-model="model"
      :rows="rows"
      :required="required"
      :aria-invalid="!!error || undefined"
      :aria-describedby="
        [$attrs['aria-describedby'], describedBy].filter(Boolean).join(' ') ||
        undefined
      "
      :class="['ui-input ui-textarea', { 'ui-textarea--auto-resize': autoResize }]"
      :style="autoResize ? { maxHeight: `${maxHeight}px` } : undefined"
      ref="textarea"
      @input="resizeToContent"
    />
  </FormField>
</template>
