<script setup lang="ts">
import BaseButton from './BaseButton.vue'
import AppIcon from './AppIcon.vue'
import type { IconName } from '../../types/ui'

defineProps<{ icon: IconName; label: string; disabled?: boolean }>()
</script>

<template>
  <BaseButton
    variant="ghost"
    class="ui-icon-button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <AppIcon :name="icon" />
  </BaseButton>
</template>
