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
      <img :src="asset.url" :alt="asset.name" />
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
