<script setup lang="ts">
import { useId } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ label: string; disabled?: boolean; indeterminate?: boolean }>()
const model = defineModel<boolean>({ default: false })
const id = useId()
</script>

<template>
  <label
    :for="id"
    class="ui-checkbox"
    :class="{ 'ui-checkbox--disabled': disabled }"
  >
    <input
      v-bind="$attrs"
      :id="id"
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      :indeterminate="indeterminate"
    />
    <span>{{ label }}</span>
  </label>
</template>
