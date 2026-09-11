<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseCard from '../ui/BaseCard.vue'
import InlineAlert from '../ui/InlineAlert.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import type { VisualDirection } from '../../types/content'

withDefaults(
  defineProps<{
    direction: VisualDirection
    title?: string
    description?: string
    copyable?: boolean
    helperTitle?: string
    helperText?: string
  }>(),
  {
    title: 'Visual Direction',
    description: 'A production brief for the later Creative step.',
    copyable: false,
    helperTitle: 'External creative production',
    helperText:
      'Final images are created externally in a tool such as Canva and uploaded during the Creative step.',
  },
)

defineEmits<{ copy: [] }>()
</script>

<template>
  <BaseCard :title="title" :description="description">
    <template v-if="copyable" #actions>
      <BaseButton variant="secondary" size="compact" @click="$emit('copy')">
        <AppIcon name="library" :size="15" />Copy Visual Brief
      </BaseButton>
    </template>
    <template v-else #actions><StatusBadge tone="neutral">Direction only</StatusBadge></template>
    <dl class="visual-direction-list">
      <div>
        <dt>Recommended Format</dt>
        <dd>{{ direction.format }}</dd>
      </div>
      <div>
        <dt>Visual Concept</dt>
        <dd>{{ direction.concept }}</dd>
      </div>
      <div>
        <dt>Slide / Content Structure</dt>
        <dd>
          <ol class="slide-structure-list">
            <li v-for="(slide, index) in direction.structure" :key="slide">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ slide }}
            </li>
          </ol>
        </dd>
      </div>
      <div>
        <dt>Visual Notes</dt>
        <dd>{{ direction.notes }}</dd>
      </div>
    </dl>
    <InlineAlert :title="helperTitle" tone="info">{{ helperText }}</InlineAlert>
  </BaseCard>
</template>
