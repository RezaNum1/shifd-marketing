import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspace = ref({ id: '', name: 'Shifd Marketing' })
  const user = ref({ id: '', name: '', initials: '', role: '' })
  const navigationOpen = ref(false)

  function closeNavigation() { navigationOpen.value = false }

  return { workspace, user, navigationOpen, closeNavigation }
})
