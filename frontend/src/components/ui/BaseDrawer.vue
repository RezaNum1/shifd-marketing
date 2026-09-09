<script setup lang="ts">
import BaseOverlay from './BaseOverlay.vue'
withDefaults(
  defineProps<{
    title: string
    description?: string
    side?: 'left' | 'right'
    size?: 'default' | 'navigation'
    dismissible?: boolean
  }>(),
  { dismissible: true },
)
const open = defineModel<boolean>({ default: false })
</script>

<template>
  <BaseOverlay
    v-model="open"
    :title="title"
    :description="description"
    :side="side"
    :size="size"
    :dismissible="dismissible"
    variant="drawer"
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </BaseOverlay>
</template>
