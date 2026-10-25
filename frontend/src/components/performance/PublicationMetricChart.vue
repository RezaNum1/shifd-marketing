<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  items: Array<{ id: string; label: string; value: number | null }>
  formatValue?: (value: number) => string
}>()

const formatValue = props.formatValue ?? ((value: number) => value.toLocaleString())
const maxValue = computed(() => Math.max(1, ...props.items.flatMap((item) => item.value === null ? [] : [item.value])))
</script>

<template>
  <div v-if="items.length" class="publication-metric-chart" role="img" :aria-label="`Per-post metric chart for ${items.length} published posts`">
    <div v-for="item in items" :key="item.id" class="publication-metric-chart__row" :title="item.label">
      <span class="publication-metric-chart__label">{{ item.label }}</span>
      <div class="publication-metric-chart__track"><span v-if="item.value !== null" class="publication-metric-chart__bar" :style="{ width: `${item.value / maxValue * 100}%` }" /></div>
      <strong class="publication-metric-chart__value">{{ item.value === null ? 'N/A' : formatValue(item.value) }}</strong>
    </div>
  </div>
  <p v-else class="publication-metric-chart__empty" role="status">No published posts for this platform in the selected date range.</p>
</template>

<style scoped>
.publication-metric-chart { display: grid; gap: 12px; max-height: 440px; overflow-y: auto; padding: 4px 6px 4px 0; }
.publication-metric-chart__row { display: grid; grid-template-columns: minmax(150px, 240px) minmax(80px, 1fr) minmax(64px, 90px); align-items: center; gap: 12px; min-height: 28px; }
.publication-metric-chart__label { overflow: hidden; color: var(--color-ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.publication-metric-chart__track { height: 16px; overflow: hidden; border-radius: 999px; background: var(--color-well); }
.publication-metric-chart__bar { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--color-primary); transition: width 180ms ease; }
.publication-metric-chart__value { color: var(--color-ink); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.publication-metric-chart__empty { display: grid; place-items: center; min-height: 120px; margin: 0; color: var(--color-muted); font-size: 12px; }
@media (max-width: 620px) { .publication-metric-chart__row { grid-template-columns: minmax(95px, 1fr) minmax(65px, 1fr) minmax(54px, 70px); gap: 8px; } }
</style>
