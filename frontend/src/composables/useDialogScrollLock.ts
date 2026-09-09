import { onBeforeUnmount } from 'vue'

let lockCount = 0
let previousOverflow = ''

/** Share the lock so closing one dialog cannot unlock a second open dialog. */
export function useDialogScrollLock() {
  let locked = false

  function lock() {
    if (locked) return
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    locked = true
  }

  function unlock() {
    if (!locked) return
    lockCount -= 1
    locked = false
    if (lockCount === 0) document.body.style.overflow = previousOverflow
  }

  onBeforeUnmount(unlock)
  return { lock, unlock }
}
