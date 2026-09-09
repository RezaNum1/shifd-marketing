<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from '../../types/ui'
withDefaults(
  defineProps<{ title: string; description: string; icon?: IconName }>(),
  { icon: 'library' },
)
</script>

<template>
  <div class="ui-empty-state">
    <div class="ui-empty-state__icon"><AppIcon :name="icon" :size="28" /></div>
    <h2 class="text-headline-md font-semibold">{{ title }}</h2>
    <p class="max-w-md text-body-md text-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-3">
      <slot />
    </div>
  </div>
</template>
