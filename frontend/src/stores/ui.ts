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

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  // Explicit dismissal keeps important feedback available to keyboard and screen-reader users.
  function notify(message: string, tone: Tone = 'info') {
    const id = ++nextId
    toasts.value.push({ id, message, tone })
    return id
  }

  return { toasts, notify, dismissToast }
})
