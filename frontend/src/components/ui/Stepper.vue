<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { StepItem } from '../../types/ui'

withDefaults(
  defineProps<{
    steps: StepItem[]
    current: string
    label?: string
    interactive?: boolean
  }>(),
  { label: 'Progress', interactive: false },
)
defineEmits<{ select: [id: string] }>()
</script>

<template>
  <nav :aria-label="label" class="ui-stepper" tabindex="0">
    <ol class="ui-stepper__list">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        class="ui-stepper__step"
        :class="{
          'is-current': step.id === current,
          'is-complete': step.complete,
        }"
        :aria-current="step.id === current ? 'step' : undefined"
      >
        <component
          :is="interactive ? 'button' : 'div'"
          class="ui-stepper__item"
          :type="interactive ? 'button' : undefined"
          :disabled="interactive ? step.disabled : undefined"
          @click="interactive && !step.disabled && $emit('select', step.id)"
        >
          <span class="ui-stepper__number"
            ><AppIcon v-if="step.complete" name="check" :size="16" /><span
              v-else
              >{{ index + 1 }}</span
            ></span
          >
          <span
            ><span class="ui-stepper__label">{{ step.label }}</span
            ><span v-if="step.description" class="ui-stepper__description">{{
              step.description
            }}</span
            ><span v-if="step.complete" class="sr-only">Completed</span></span
          >
        </component>
      </li>
    </ol>
    <progress
      v-if="steps.some((step) => step.id === current)"
      class="ui-stepper__progress"
      :value="steps.findIndex((step) => step.id === current) + 1"
      :max="steps.length"
      aria-label="Current step position"
    />
  </nav>
</template>
