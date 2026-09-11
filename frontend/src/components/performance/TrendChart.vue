<script setup lang="ts">
import { computed } from 'vue'

interface ChartSeries {
  label: string
  color: string
  values: number[]
}

const props = defineProps<{
  labels: string[]
  series: ChartSeries[]
  formatValue?: (value: number) => string
}>()

const width = 640
const height = 230
const padding = { top: 16, right: 18, bottom: 32, left: 42 }
const plotWidth = width - padding.left - padding.right
const plotHeight = height - padding.top - padding.bottom
const formatValue = props.formatValue ?? ((value: number) => value.toLocaleString())
const maxValue = computed(() => Math.max(1, ...props.series.flatMap((series) => series.values)))
const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue.value * ratio)))
const x = (index: number) => props.labels.length <= 1 ? padding.left : padding.left + (index / (props.labels.length - 1)) * plotWidth
const y = (value: number) => padding.top + plotHeight - (value / maxValue.value) * plotHeight
function points(values: number[]) { return values.map((value, index) => `${x(index)},${y(value)}`).join(' ') }
</script>

<template>
  <div class="trend-chart" role="img" :aria-label="`Trend chart showing ${series.map((item) => item.label).join(' and ')}`">
    <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" aria-hidden="true">
      <g class="trend-chart__grid">
        <line v-for="tick in yTicks" :key="tick" :x1="padding.left" :x2="width - padding.right" :y1="y(tick)" :y2="y(tick)" />
      </g>
      <g class="trend-chart__y-labels">
        <text v-for="tick in yTicks" :key="`label-${tick}`" :x="padding.left - 8" :y="y(tick) + 4" text-anchor="end">{{ formatValue(tick) }}</text>
      </g>
      <g v-for="item in series" :key="item.label">
        <polyline :points="points(item.values)" fill="none" :stroke="item.color" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle v-for="(value, index) in item.values" :key="`${item.label}-${index}`" :cx="x(index)" :cy="y(value)" r="3.5" :fill="item.color" stroke="white" stroke-width="2" />
      </g>
      <g class="trend-chart__x-labels">
        <text v-for="(label, index) in labels" :key="label" :x="x(index)" :y="height - 9" text-anchor="middle">{{ label }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.trend-chart { width: 100%; min-height: 220px; }
.trend-chart svg { display: block; width: 100%; height: 220px; overflow: visible; }
.trend-chart__grid line { stroke: var(--color-border); stroke-dasharray: 3 4; }
.trend-chart__y-labels text, .trend-chart__x-labels text { fill: var(--color-subtle); font-size: 10px; font-family: var(--font-sans); }
</style>
