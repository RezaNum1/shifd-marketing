<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../../stores/ui'
import IconButton from '../ui/IconButton.vue'
const ui = useUiStore()
// Render only the newest item so stale HMR/session state can never stack notices.
const latestToast = computed(() => ui.toasts.at(-1))
</script>

<template>
  <div
    class="app-toasts"
    aria-label="Notifications"
    aria-live="polite"
    aria-relevant="additions"
  >
    <Transition name="toast" mode="out-in">
      <div
        v-if="latestToast"
        :key="latestToast.id"
        class="app-toast"
        :class="`ui-tone--${latestToast.tone}`"
      >
        <p>{{ latestToast.message }}</p>
        <IconButton
          icon="close"
          label="Dismiss notification"
          @click="ui.dismissToast(latestToast.id)"
        />
      </div>
    </Transition>
  </div>
</template>
