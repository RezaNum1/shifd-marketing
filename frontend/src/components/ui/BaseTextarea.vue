<script setup lang="ts">
import { useId } from 'vue'
import FormField from './FormField.vue'

defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    id?: string
    label: string
    hint?: string
    error?: string
    required?: boolean
    rows?: number
  }>(),
  { rows: 4 },
)
const model = defineModel<string>({ default: '' })
const generatedId = useId()
</script>

<template>
  <FormField
    :id="id ?? generatedId"
    :label="label"
    :hint="hint"
    :error="error"
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
      class="ui-input ui-textarea"
    />
  </FormField>
</template>
