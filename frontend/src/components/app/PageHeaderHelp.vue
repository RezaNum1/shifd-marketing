<script setup lang="ts">
import InfoTooltip from '../ui/InfoTooltip.vue'

defineProps<{ help: { purpose: string; steps: string[] } }>()
</script>

<template>
  <InfoTooltip label="Page purpose and usage" align="start">
    <div class="page-header-help__content">
      <strong>Purpose</strong>
      <p>{{ help.purpose }}</p>
      <strong>How to use</strong>
      <ol>
        <li v-for="(step, index) in help.steps" :key="index">
          <span class="page-header-help__step-number">{{ index + 1 }}.</span>
          <span>{{ step }}</span>
        </li>
      </ol>
    </div>
  </InfoTooltip>
</template>

<style scoped>
.page-header-help__content { display: grid; gap: 5px; }
.page-header-help__content p { margin: 0 0 5px; }
.page-header-help__content ol { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.page-header-help__content li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 4px; align-items: start; }
.page-header-help__step-number { font-weight: 700; }
</style>
