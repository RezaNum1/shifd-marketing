<script setup lang="ts">
import type { ContentAssetRecord } from '../../types/content'

defineProps<{
  asset: ContentAssetRecord
  showMetadata?: boolean
}>()

defineEmits<{ preview: [asset: ContentAssetRecord] }>()
</script>

<template>
  <button
    type="button"
    class="record-asset"
    :aria-label="`Preview ${asset.name}`"
    @click="$emit('preview', asset)"
  >
    <span class="record-asset__visual">
      <img v-if="asset.url" :src="asset.url" :alt="asset.name" />
      <span v-else class="record-asset__placeholder">
        <small>Creative placeholder</small>
        <strong>{{ asset.previewLabel ?? 'Creative' }}</strong>
        <i aria-hidden="true" />
      </span>
      <span class="record-asset__order">{{ String(asset.order).padStart(2, '0') }}</span>
    </span>
    <span v-if="showMetadata" class="record-asset__meta">
      <strong>{{ asset.name }}</strong>
      <small>{{ asset.type }} · Position {{ String(asset.order).padStart(2, '0') }}</small>
    </span>
  </button>
</template>

<style scoped>
.record-asset { display: flex; flex-direction: column; gap: 8px; min-width: 0; text-align: left; color: var(--color-text); }
.record-asset__visual { position: relative; display: block; overflow: hidden; aspect-ratio: 4 / 5; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: #eff4ff; }
.record-asset__visual img { width: 100%; height: 100%; object-fit: cover; }
.record-asset__placeholder { display: flex; flex-direction: column; justify-content: flex-end; width: 100%; height: 100%; padding: 14px; color: white; background: var(--color-well); }
.record-asset__placeholder small { margin-bottom: auto; color: var(--color-muted); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.record-asset__placeholder strong { max-width: 10ch; color: var(--color-ink); font-size: 14px; line-height: 1.25; font-weight: 600; }
.record-asset__placeholder i { width: 58%; height: 4px; margin-top: 12px; border-radius: 999px; background: var(--color-control-border); }
.record-asset__order { position: absolute; right: 8px; bottom: 8px; display: grid; place-items: center; min-width: 25px; height: 22px; padding-inline: 5px; border-radius: 5px; background: rgb(255 255 255 / .92); color: #0b1c30; font-size: 10px; font-weight: 600; }
.record-asset__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.record-asset__meta strong { overflow: hidden; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.record-asset__meta small { color: var(--color-muted); font-size: 11px; }
.record-asset:hover .record-asset__visual, .record-asset:focus-visible .record-asset__visual { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgb(29 78 216 / .12); }
.record-asset:focus-visible { outline: 0; }
</style>
