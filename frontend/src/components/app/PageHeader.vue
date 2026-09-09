<script setup lang="ts">
import type { Breadcrumb } from '../../types/navigation'
import AppBreadcrumbs from './AppBreadcrumbs.vue'
defineProps<{
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
}>()
</script>

<template>
  <header class="page-header">
    <AppBreadcrumbs v-if="breadcrumbs?.length" :items="breadcrumbs" />
    <div class="page-header__row">
      <div class="min-w-0">
        <h1 class="page-header__title">{{ title }}</h1>
        <p v-if="description" class="page-header__description">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
