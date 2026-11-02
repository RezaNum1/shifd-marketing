<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import InlineAlert from '../ui/InlineAlert.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import AppIcon from '../ui/AppIcon.vue'
import type { BrandAssessment, BrandCheckFailure } from '../../types/content'

const props = defineProps<{
  assessment: BrandAssessment
  overrideJustification: string
  error?: BrandCheckFailure | null
  failureBypassed?: boolean
  manualOverride?: boolean
}>()

defineEmits<{
  regenerate: []
  override: []
}>()

const warningChecks = computed(() => props.assessment.checks.filter((check) => check.status === 'warning'))
const notAssessedChecks = computed(() => props.assessment.checks.filter((check) => check.status === 'not_assessed'))
const hasCurrentAssessment = computed(() => props.assessment.state === 'assessed' && props.assessment.checks.length > 0)
const canOverride = computed(() => {
  if (props.failureBypassed || props.manualOverride) return false
  if (hasCurrentAssessment.value) return props.assessment.status === 'Needs Attention'
  return Boolean(props.error?.canOverride && props.error.aiRequestId)
})
const displayStatus = computed(() => {
  if (props.failureBypassed || props.manualOverride) return 'Bypassed'
  if (props.error && !hasCurrentAssessment.value) return 'Check Failed'
  if (!hasCurrentAssessment.value) return 'Needs Re-check'
  return props.assessment.status
})
const statusTone = computed(() => displayStatus.value === 'Aligned' ? 'success' : displayStatus.value === 'Bypassed' ? 'info' : 'warning')
const scoreExplanation = computed(() => {
  const warningCount = warningChecks.value.length
  return warningCount === 0
    ? 'No warning deduction: 100 - 0 = 100.'
    : `${warningCount} warning${warningCount === 1 ? '' : 's'} × 12 points = ${warningCount * 12}-point deduction. Final score: ${props.assessment.score}/100.`
})
</script>

<template>
  <div class="assessment-panel">
    <div class="review-section-heading">
      <div><span class="brief-overline">AI Brand Assessment</span><small>Advisory evidence per platform</small></div>
      <StatusBadge :tone="statusTone" dot>{{ displayStatus }}</StatusBadge>
    </div>

    <template v-if="hasCurrentAssessment">
      <div class="assessment-score-row">
        <strong>{{ assessment.score }}<small>/100</small></strong>
        <span>{{ assessment.checks.some((check) => check.label === 'Visual Creative Review' && check.status !== 'not_assessed') ? 'Text, context, and creative reviewed' : 'Text and context only' }}</span>
      </div>
      <div class="assessment-score-reason">
        <strong>Why this score</strong>
        <p>{{ scoreExplanation }}</p>
        <p v-if="warningChecks.length"><b>Warning factors:</b> {{ warningChecks.map((check) => check.label).join(', ') }}.</p>
        <p v-if="notAssessedChecks.length"><b>Not scored:</b> {{ notAssessedChecks.map((check) => check.label).join(', ') }}.</p>
      </div>
      <div class="assessment-check-list">
        <div v-for="check in assessment.checks" :key="check.label">
          <span>{{ check.label }}</span>
          <StatusBadge :tone="check.status === 'pass' ? 'success' : check.status === 'warning' ? 'warning' : 'info'">{{ check.status === 'pass' ? 'Pass' : check.status === 'warning' ? 'Warning' : 'Not analyzed' }}</StatusBadge>
        </div>
      </div>
      <InlineAlert title="Recommendation" tone="info">{{ assessment.recommendation }}</InlineAlert>
      <InlineAlert v-if="manualOverride" title="AI check skipped by human review" tone="info">
        A reason is recorded for this platform. The saved copy and creative still need human review before approval.
      </InlineAlert>
    </template>

    <InlineAlert v-else-if="manualOverride" title="AI check skipped by human review" tone="info">
      A reason is recorded for this platform. The saved copy and creative still need human review before approval.
    </InlineAlert>

    <InlineAlert v-else-if="!error" title="Brand Check recommended" tone="warning">
      The platform copy or its supporting context changed. Use the single Brand Consistency Check button above to assess all enabled platforms.
    </InlineAlert>

    <InlineAlert v-if="error" :title="failureBypassed ? 'Failed check bypassed by human review' : 'Brand Check did not complete'" :tone="failureBypassed ? 'warning' : 'danger'">
      <div class="assessment-error-detail">
        <p>{{ error.message }}</p>
        <dl>
          <div><dt>Error code</dt><dd>{{ error.code }}</dd></div>
          <div v-if="error.missingInputs.length"><dt>Missing input</dt><dd>{{ error.missingInputs.join(', ') }}</dd></div>
          <div v-if="error.aiRequestId"><dt>AI attempt</dt><dd>{{ error.aiRequestId }}</dd></div>
          <div v-if="error.requestId"><dt>Request reference</dt><dd>{{ error.requestId }}</dd></div>
        </dl>
        <p v-if="error.canOverride && !failureBypassed && !hasCurrentAssessment">You may retry the check or explicitly bypass this failed AI attempt with a required justification. No score is invented for a failed check.</p>
      </div>
    </InlineAlert>

    <div class="assessment-actions">
      <BaseButton variant="secondary" size="compact" @click="$emit('regenerate')"><AppIcon name="sparkles" :size="14" />Regenerate copy</BaseButton>
      <BaseButton v-if="canOverride" variant="ghost" size="compact" @click="$emit('override')">Override</BaseButton>
    </div>
    <div v-if="overrideJustification" class="override-record">
      <StatusBadge tone="warning" dot>{{ failureBypassed ? 'Failed check bypass recorded' : 'Override recorded' }}</StatusBadge>
      <p>{{ overrideJustification }}</p>
    </div>
  </div>
</template>
