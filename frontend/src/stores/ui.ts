import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Tone } from '../types/ui'

interface Toast {
  id: number
  message: string
  tone: Tone
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  let nextId = 0
  let dismissTimer: ReturnType<typeof setTimeout> | undefined

  function dismissToast(id: number) {
    if (toasts.value[0]?.id !== id) return
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = undefined
    }
  }

  // Keep feedback concise and replace older messages so the workspace stays unobstructed.
  function notify(message: string, tone: Tone = 'info') {
    const id = ++nextId
    if (dismissTimer) clearTimeout(dismissTimer)
    toasts.value = [{ id, message, tone }]
    dismissTimer = setTimeout(() => dismissToast(id), 4000)
    return id
  }

  return { toasts, notify, dismissToast }
})
