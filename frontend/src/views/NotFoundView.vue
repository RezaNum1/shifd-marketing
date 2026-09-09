<script setup lang="ts">
import PageHeader from '../components/app/PageHeader.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AppIcon from '../components/ui/AppIcon.vue'
</script>

<template>
  <div class="page-stack">
    <PageHeader
      title="Page not found"
      :breadcrumbs="[{ label: 'Workspace' }, { label: 'Page not found' }]"
    />
    <BaseCard>
      <EmptyState
        icon="search"
        title="We couldn’t find that page"
        description="Check the address or return to your workspace overview."
      >
        <RouterLink
          to="/"
          class="ui-button ui-button--primary ui-control--default"
          ><AppIcon name="arrow-left" :size="16" />Back to Overview</RouterLink
        >
      </EmptyState>
    </BaseCard>
  </div>
</template>
