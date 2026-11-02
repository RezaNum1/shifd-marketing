<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import type { CreativeAsset } from '../../types/content'

withDefaults(
  defineProps<{
    asset: CreativeAsset
    index: number
    removable?: boolean
    inherited?: boolean
  }>(),
  { removable: true, inherited: false },
)

defineEmits<{
  remove: [id: string]
  dragStart: [id: string]
  dragEnd: []
  drop: [id: string]
}>()
</script>

<template>
  <article
    class="creative-asset-card"
    :class="{ 'is-inherited': inherited }"
    :draggable="!inherited"
    @dragstart="$emit('dragStart', asset.id)"
    @dragend="$emit('dragEnd')"
    @dragover.prevent
    @drop="$emit('drop', asset.id)"
  >
    <div class="creative-asset-preview">
      <video v-if="asset.mimeType === 'video/mp4' || asset.name.toLowerCase().endsWith('.mp4')" :src="asset.url" :aria-label="asset.name" controls preload="metadata" />
      <img v-else :src="asset.url" :alt="asset.name" />
      <span>{{ String(index + 1).padStart(2, '0') }}</span>
    </div>
    <div class="creative-asset-meta">
      <strong>{{ asset.name }}</strong>
      <small v-if="inherited">Instagram</small>
      <button
        v-else-if="removable"
        type="button"
        class="creative-remove"
        :aria-label="`Remove ${asset.name}`"
        @click="$emit('remove', asset.id)"
      >
        <AppIcon name="close" :size="14" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.creative-asset-preview img,
.creative-asset-preview video { width: 100%; height: 100%; object-fit: cover; }
</style>
