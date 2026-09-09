<script setup lang="ts">
import type { Tone } from '../../types/ui'
withDefaults(defineProps<{ tone?: Tone; dot?: boolean }>(), {
  tone: 'neutral',
  dot: false,
})
</script>

<template>
  <span class="ui-badge" :class="`ui-tone--${tone}`">
    <span v-if="dot" class="ui-badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>
