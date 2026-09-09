<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import AppIcon from '../components/ui/AppIcon.vue'

const route = useRoute()
const parent = computed(() => route.meta.breadcrumbs.find((item) => item.to))
</script>

<template>
  <div class="page-stack">
    <PageHeader
      :title="route.meta.title"
      :description="route.meta.description"
      :breadcrumbs="route.meta.breadcrumbs"
    >
      <template #actions><StatusBadge dot>Coming soon</StatusBadge></template>
    </PageHeader>
    <BaseCard class="placeholder-card">
      <EmptyState
        :icon="route.meta.icon"
        title="This section is coming soon"
        description="This part of your workspace is coming soon. Explore the sections in the navigation to see what’s ahead."
      >
        <RouterLink
          v-if="parent"
          :to="parent.to!"
          class="ui-button ui-button--secondary ui-control--default"
          ><AppIcon name="arrow-left" :size="16" />Back to
          {{ parent.label }}</RouterLink
        >
      </EmptyState>
      <template #footer>
        <div class="placeholder-card__footer">
          <AppIcon name="company" :size="16" /><span
            >Shifd Marketing workspace</span
          >
        </div>
      </template>
    </BaseCard>
  </div>
</template>
