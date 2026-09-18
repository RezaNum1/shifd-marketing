<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import InlineAlert from '../ui/InlineAlert.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import AppIcon from '../ui/AppIcon.vue'
import type { BrandAssessment } from '../../types/content'

const props = defineProps<{
  assessment: BrandAssessment
  overrideJustification: string
}>()

defineEmits<{
  regenerate: []
  recheck: []
  override: []
}>()

const hasWarning = () => props.assessment.status === 'Needs Attention' || props.assessment.checks.some((check) => check.status === 'warning')
</script>

<template>
  <div class="assessment-panel">
    <div class="review-section-heading">
      <div><span class="brief-overline">AI Brand Assessment</span><small>Advisory only</small></div>
      <StatusBadge :tone="assessment.state === 'needs-recheck' ? 'warning' : assessment.status === 'Aligned' ? 'success' : 'warning'" dot>
        {{ assessment.state === 'needs-recheck' ? 'Needs Re-check' : assessment.status }}
      </StatusBadge>
    </div>
    <div v-if="assessment.state !== 'needs-recheck'" class="assessment-score-row">
      <strong>{{ assessment.score }}<small>/100</small></strong><span>Backend textual/context assessment</span>
    </div>
    <div class="assessment-check-list">
      <div v-for="check in assessment.checks" :key="check.label">
        <span>{{ check.label }}</span>
        <StatusBadge :tone="check.status === 'pass' ? 'success' : 'warning'">{{ check.status === 'pass' ? 'Pass' : 'Warning' }}</StatusBadge>
      </div>
    </div>
    <InlineAlert :title="assessment.state === 'needs-recheck' ? 'Re-check required' : 'Recommendation'" :tone="assessment.state === 'needs-recheck' ? 'warning' : 'info'">
      {{ assessment.state === 'needs-recheck' ? 'Manual edits or regeneration changed this draft. Re-check alignment before approval.' : assessment.recommendation }}
    </InlineAlert>
    <div class="assessment-actions">
      <BaseButton variant="secondary" size="compact" @click="$emit('regenerate')"><AppIcon name="sparkles" :size="14" />Regenerate</BaseButton>
      <BaseButton v-if="assessment.state === 'needs-recheck'" variant="secondary" size="compact" @click="$emit('recheck')">Re-check Alignment</BaseButton>
      <BaseButton v-if="hasWarning()" variant="ghost" size="compact" @click="$emit('override')">Override</BaseButton>
    </div>
    <div v-if="overrideJustification" class="override-record">
      <StatusBadge tone="warning" dot>Override recorded</StatusBadge>
      <p>{{ overrideJustification }}</p>
    </div>
  </div>
</template>
