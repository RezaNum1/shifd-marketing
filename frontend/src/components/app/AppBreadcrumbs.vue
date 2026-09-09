<script setup lang="ts">
import type { Breadcrumb } from '../../types/navigation'
import AppIcon from '../ui/AppIcon.vue'
defineProps<{ items: Breadcrumb[] }>()
</script>

<template>
  <nav aria-label="Breadcrumb" class="app-breadcrumbs">
    <ol>
      <li v-for="(item, index) in items" :key="`${item.label}-${index}`">
        <AppIcon v-if="index > 0" name="chevron-right" :size="12" />
        <RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink>
        <span
          v-else
          :aria-current="index === items.length - 1 ? 'page' : undefined"
          >{{ item.label }}</span
        >
      </li>
    </ol>
  </nav>
</template>
