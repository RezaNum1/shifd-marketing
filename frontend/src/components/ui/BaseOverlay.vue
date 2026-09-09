<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useDialogScrollLock } from '../../composables/useDialogScrollLock'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    variant?: 'modal' | 'drawer'
    size?: 'default' | 'wide' | 'navigation'
    side?: 'left' | 'right'
    dismissible?: boolean
  }>(),
  { variant: 'modal', size: 'default', side: 'right', dismissible: true },
)

const open = defineModel<boolean>({ default: false })
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
const descriptionId = useId()
const { lock, unlock } = useDialogScrollLock()
let trigger: HTMLElement | null = null
let backdropPress = false

function onPointerDown(event: PointerEvent) {
  backdropPress = event.target === event.currentTarget
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled, [inert]') &&
      element.getClientRects().length > 0,
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    event.preventDefault()
    dialog.value.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function synchronize() {
  if (!dialog.value) return
  if (open.value && !dialog.value.open) {
    trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    dialog.value.showModal()
    lock()
  } else if (!open.value && dialog.value.open) {
    dialog.value.close()
    unlock()
  }
}

function requestClose() {
  if (props.dismissible) open.value = false
}

function onClose() {
  // Ignore a queued close event if the caller has already reopened the dialog.
  if (dialog.value?.open) return
  open.value = false
  unlock()
  if (trigger?.isConnected) trigger.focus({ preventScroll: true })
}

watch(open, synchronize, { flush: 'post' })
onMounted(synchronize)
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="ui-overlay"
      :class="[
        `ui-overlay--${variant}`,
        `ui-overlay--${side}`,
        `ui-overlay--${size}`,
      ]"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      @cancel.prevent="requestClose"
      @close="onClose"
      @pointerdown="onPointerDown"
      @keydown="onKeydown"
      @click.self="backdropPress && requestClose()"
    >
      <div class="ui-overlay__panel">
        <header class="ui-overlay__header">
          <div class="min-w-0">
            <h2 :id="titleId" class="text-headline-md font-semibold">
              {{ title }}
            </h2>
            <p
              v-if="description"
              :id="descriptionId"
              class="mt-1 text-body-sm text-muted"
            >
              {{ description }}
            </p>
          </div>
          <IconButton
            v-if="dismissible"
            icon="close"
            :label="`Close ${title}`"
            @click="requestClose"
          />
        </header>
        <div class="ui-overlay__body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-overlay__footer">
          <slot name="footer" />
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>
