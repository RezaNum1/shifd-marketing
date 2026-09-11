<script setup lang="ts">
import Stepper from '../ui/Stepper.vue'
import type { WorkflowStep } from '../../types/content'
import type { StepItem } from '../../types/ui'

const workflowOrder: WorkflowStep[] = [
  'brief',
  'generate',
  'adapt',
  'creative',
  'review',
  'schedule',
]

const props = defineProps<{
  steps: StepItem[]
  current: WorkflowStep
}>()

const normalizedSteps = () => {
  const currentIndex = workflowOrder.indexOf(props.current)
  return props.steps.map((step) => ({
    ...step,
    complete: workflowOrder.indexOf(step.id as WorkflowStep) < currentIndex,
    disabled: step.id !== 'brief' && step.id !== props.current,
  }))
}
</script>

<template>
  <Stepper :steps="normalizedSteps()" :current="current" label="Content creation workflow" />
</template>
