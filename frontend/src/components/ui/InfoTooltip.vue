<script setup lang="ts">
import { useId } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps<{ text?: string; label?: string; align?: 'start' | 'end' }>()
const tooltipId = useId()
</script>

<template>
  <span class="info-tooltip" :class="`info-tooltip--${align ?? 'start'}`">
    <button
      class="info-tooltip__trigger"
      type="button"
      :aria-label="label ?? 'More information'"
      :aria-describedby="tooltipId"
    >
      <AppIcon name="info" :size="14" />
    </button>
    <div :id="tooltipId" class="info-tooltip__bubble" role="tooltip"><slot>{{ text }}</slot></div>
  </span>
</template>

<style scoped>
.info-tooltip { position: relative; display: inline-flex; flex: 0 0 auto; vertical-align: middle; }
.info-tooltip__trigger { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 1px solid transparent; border-radius: 50%; background: transparent; color: var(--color-subtle); cursor: help; }
.info-tooltip__trigger:hover, .info-tooltip__trigger:focus-visible { border-color: var(--color-control-border); background: var(--color-well); color: var(--color-primary); outline: none; }
.info-tooltip__bubble { position: absolute; z-index: 80; top: calc(100% + 7px); width: min(280px, calc(100vw - 40px)); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface-container-highest, #fff); color: var(--color-text); box-shadow: 0 8px 24px rgb(15 23 42 / 16%); font-size: 12px; font-weight: 400; line-height: 1.5; letter-spacing: normal; text-align: left; text-transform: none; white-space: normal; opacity: 0; visibility: hidden; pointer-events: auto; transform: translateY(-3px); transition: opacity 120ms ease, transform 120ms ease, visibility 120ms; }
.info-tooltip--start .info-tooltip__bubble { left: 0; }
.info-tooltip--end .info-tooltip__bubble { right: 0; }
.info-tooltip__bubble::before { position: absolute; bottom: 100%; width: 9px; height: 9px; border-top: 1px solid var(--color-border); border-left: 1px solid var(--color-border); background: var(--color-surface-container-highest, #fff); content: ''; transform: translateY(5px) rotate(45deg); }
.info-tooltip--start .info-tooltip__bubble::before { left: 6px; }
.info-tooltip--end .info-tooltip__bubble::before { right: 6px; }
.info-tooltip:hover .info-tooltip__bubble { opacity: 1; visibility: visible; transform: translateY(0); }
</style>
