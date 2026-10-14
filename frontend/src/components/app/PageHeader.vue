<script setup lang="ts">
import { computed } from 'vue'
import type { Breadcrumb } from '../../types/navigation'
import AppBreadcrumbs from './AppBreadcrumbs.vue'
import PageHeaderHelp from './PageHeaderHelp.vue'
type PageHelp = { purpose: string; steps: string[] }
const props = defineProps<{
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
  help?: PageHelp
}>()

const pageGuides: Record<string, PageHelp> = {
  'Content Ideas': { purpose: 'Capture and organize possible topics before turning them into marketing content.', steps: ['Add an idea with a clear topic and audience.', 'Review or edit the saved idea as your thinking develops.', 'Mark a suitable idea ready, then use it to start content creation.'] },
  'Content Library': { purpose: 'Find and manage content as it moves from draft through approval and publication.', steps: ['Search or filter to find the content you need.', 'Open a content item to review its copy, creative, and activity.', 'Use the available actions to continue, archive, or update that item.'] },
  'Content Calendar': { purpose: 'Plan and track when approved content will be published on each platform.', steps: ['Choose the date range and filters to find a schedule.', 'Plan approved content or open a scheduled item to review it.', 'After publishing manually, mark the item as published and enter the publication details.'] },
  'Company Context': { purpose: 'Maintain the company, audience, and brand information that guides content generation.', steps: ['Review each context section and correct outdated information.', 'Edit the relevant fields with specific, accurate details.', 'Save the section so future content can use the updated context.'] },
  Products: { purpose: 'Keep product information organized so it can be selected as context during content creation.', steps: ['Create a product or select one from the list.', 'Add its audience, positioning, and key details.', 'Save changes and select the product when creating related content.'] },
  Integrations: { purpose: 'Review the external services that provide data to the workspace.', steps: ['Check each service status and its current data source.', 'Use the available connect or disconnect action for that service.', 'Return to Performance to review data supplied by connected sources.'] },
  'AI & System': { purpose: 'Review AI configuration, supported operations, prompt versions, and system usage.', steps: ['Check the configuration and system status cards.', 'Open a prompt version when you need to inspect its details.', 'Review recent requests and usage to understand system activity.'] },
  'LinkedIn Metrics': { purpose: 'Store weekly LinkedIn Analytics values for use in Performance reports.', steps: ['Add one record for a completed week and set its start and end dates.', 'Copy the displayed metrics from LinkedIn Analytics; leave unavailable optional values blank.', 'Save the record, or use Edit in the table to correct it later.'] },
  'Performance Evaluation': { purpose: 'Compare the four weeks before an intervention with the four weeks after it.', steps: ['Set and save the intervention start date.', 'Record verified Week 0 and Week 4 follower counts with their source.', 'Review the comparison, and open additional data when you need to record activity.'] },
  Performance: { purpose: 'Summarize publishing results and social channel performance for the selected period.', steps: ['Choose a reporting period and platform at the top of the page.', 'Review the metric cards and charts for recent results.', 'Open Evaluation for a research comparison or LinkedIn Metrics to add weekly data.'] },
  Overview: { purpose: 'See the current state of marketing work, upcoming posts, and items needing attention.', steps: ['Review attention items first and open anything that needs action.', 'Check upcoming and recently published content.', 'Use a card shortcut to continue in the relevant area.'] },
}

const resolvedHelp = computed<PageHelp>(() => props.help ?? pageGuides[props.title] ?? {
  purpose: props.description || `Review information and actions for ${props.title}.`,
  steps: ['Review the information shown on this page.', 'Use the available controls to make or find the change you need.', 'Save your changes or use the page actions to continue.'],
})
</script>

<template>
  <header class="page-header">
    <AppBreadcrumbs v-if="breadcrumbs?.length" :items="breadcrumbs" />
    <div class="page-header__row">
      <div class="min-w-0">
        <div class="page-header__title-row">
          <h1 class="page-header__title">{{ title }}</h1>
          <PageHeaderHelp :help="resolvedHelp" />
        </div>
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

<style scoped>
.page-header__title-row { display: flex; align-items: center; flex-wrap: nowrap; gap: 10px; width: max-content; max-width: 100%; }
.page-header__title-row .page-header__title { min-width: 0; flex: 0 1 auto; }
</style>
