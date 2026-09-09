<script setup lang="ts">
import { useId } from 'vue'
import FormField from './FormField.vue'
import type { ControlSize } from '../../types/ui'

defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    id?: string
    label: string
    hint?: string
    error?: string
    required?: boolean
    size?: ControlSize
    type?:
      | 'text'
      | 'email'
      | 'url'
      | 'search'
      | 'tel'
      | 'password'
      | 'number'
      | 'date'
      | 'time'
  }>(),
  { size: 'default', type: 'text' },
)
const model = defineModel<string | number>({ default: '' })
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
    <input
      v-bind="$attrs"
      :id="id ?? generatedId"
      v-model="model"
      :type="type"
      :required="required"
      :aria-invalid="!!error || undefined"
      :aria-describedby="
        [$attrs['aria-describedby'], describedBy].filter(Boolean).join(' ') ||
        undefined
      "
      class="ui-input"
      :class="`ui-control--${size}`"
    />
  </FormField>
</template>
