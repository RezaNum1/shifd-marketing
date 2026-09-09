<script setup lang="ts">
import BaseOverlay from './BaseOverlay.vue'
withDefaults(
  defineProps<{
    title: string
    description?: string
    size?: 'default' | 'wide'
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
    :size="size"
    :dismissible="dismissible"
    variant="modal"
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </BaseOverlay>
</template>
