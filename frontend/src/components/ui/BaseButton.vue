<script setup lang="ts">
import type { ButtonVariant, ControlSize } from '../../types/ui'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ControlSize
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'default',
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-control--${size}`]"
  >
    <span v-if="loading" class="ui-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
