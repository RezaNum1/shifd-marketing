<script setup lang="ts">
import { computed } from 'vue'
import { useId } from 'vue'
import FormField from './FormField.vue'
import type { ControlSize, SelectOption } from '../../types/ui'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    id?: string
    label: string
    options: SelectOption[]
    placeholder?: string
    hint?: string
    error?: string
    tooltip?: string
    required?: boolean
    size?: ControlSize
  }>(),
  { size: 'default' },
)
const model = defineModel<string>({ default: '' })
const selectedOption = computed(() => props.options.find((option) => option.value === model.value))
const generatedId = useId()
</script>

<template>
  <FormField
    :id="id ?? generatedId"
    :label="label"
    :hint="hint ?? selectedOption?.description"
    :tooltip="tooltip"
    :error="error"
    :required="required"
    v-slot="{ describedBy }"
  >
    <select
      v-bind="$attrs"
      :id="id ?? generatedId"
      v-model="model"
      :required="required"
      :title="($attrs.title as string | undefined) ?? selectedOption?.description"
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
        :title="option.description"
      >
        {{ option.label }}
      </option>
    </select>
  </FormField>
</template>
