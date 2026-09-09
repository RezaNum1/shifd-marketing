<script setup lang="ts">
import { useId } from 'vue'
import FormField from './FormField.vue'
import type { ControlSize, SelectOption } from '../../types/ui'

defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    id?: string
    label: string
    options: SelectOption[]
    placeholder?: string
    hint?: string
    error?: string
    required?: boolean
    size?: ControlSize
  }>(),
  { size: 'default' },
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
    <select
      v-bind="$attrs"
      :id="id ?? generatedId"
      v-model="model"
      :required="required"
      :aria-invalid="!!error || undefined"
      :aria-describedby="
        [$attrs['aria-describedby'], describedBy].filter(Boolean).join(' ') ||
        undefined
      "
      class="ui-input ui-select"
      :class="`ui-control--${size}`"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
  </FormField>
</template>
