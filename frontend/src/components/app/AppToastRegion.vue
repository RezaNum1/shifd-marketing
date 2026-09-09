<script setup lang="ts">
import { useUiStore } from '../../stores/ui'
import IconButton from '../ui/IconButton.vue'
const ui = useUiStore()
</script>

<template>
  <div
    class="app-toasts"
    aria-label="Notifications"
    aria-live="polite"
    aria-relevant="additions"
  >
    <div
      v-for="toast in ui.toasts"
      :key="toast.id"
      class="app-toast"
      :class="`ui-tone--${toast.tone}`"
    >
      <p>{{ toast.message }}</p>
      <IconButton
        icon="close"
        label="Dismiss notification"
        @click="ui.dismissToast(toast.id)"
      />
    </div>
  </div>
</template>
