<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
}>()
const describedBy = computed(
  () =>
    [props.hint && `${props.id}-hint`, props.error && `${props.id}-error`]
      .filter(Boolean)
      .join(' ') || undefined,
)
</script>

<template>
  <div class="ui-field">
    <label :for="id" class="ui-field__label"
      >{{ label
      }}<span v-if="required" class="text-danger" aria-hidden="true">
        *</span
      ></label
    >
    <slot :described-by="describedBy" />
    <p v-if="hint" :id="`${id}-hint`" class="ui-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="ui-field__error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
