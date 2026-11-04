import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspace = ref({ id: '', name: 'Shifd Marketing' })
  const user = ref({ id: '', name: '', initials: '', role: '' })
  const sidebarPinned = ref(true)
  const sidebarHovered = ref(false)
  const sidebarVisible = computed(() => sidebarPinned.value || sidebarHovered.value)
  const navigationOpen = ref(false)

  function closeNavigation() { navigationOpen.value = false }
  function showSidebarPreview() {
    if (!sidebarPinned.value) sidebarHovered.value = true
  }
  function hideSidebarPreview() { sidebarHovered.value = false }
  function pinSidebar() {
    sidebarPinned.value = true
    sidebarHovered.value = false
  }
  function toggleSidebar() {
    if (sidebarPinned.value) {
      sidebarPinned.value = false
      sidebarHovered.value = false
    } else {
      pinSidebar()
    }
  }

  return {
    workspace,
    user,
    sidebarPinned,
    sidebarHovered,
    sidebarVisible,
    navigationOpen,
    closeNavigation,
    showSidebarPreview,
    hideSidebarPreview,
    pinSidebar,
    toggleSidebar,
  }
})
