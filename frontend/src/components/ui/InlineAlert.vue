<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { Tone } from '../../types/ui'
withDefaults(defineProps<{ title?: string; tone?: Tone }>(), { tone: 'info' })
</script>

<template>
  <div
    class="ui-alert"
    :class="`ui-tone--${tone}`"
    :role="tone === 'danger' ? 'alert' : 'status'"
  >
    <AppIcon
      :name="tone === 'danger' || tone === 'warning' ? 'alert' : 'info'"
    />
    <div>
      <p v-if="title" class="font-semibold">{{ title }}</p>
      <slot />
    </div>
  </div>
</template>
