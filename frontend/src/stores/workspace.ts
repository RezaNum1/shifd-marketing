import { defineStore } from 'pinia'
import { ref } from 'vue'
import { workspace as initialWorkspace, workspaceUser } from '../data/workspace'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspace = ref({ ...initialWorkspace })
  const user = ref({ ...workspaceUser })
  const navigationOpen = ref(false)

  function closeNavigation() {
    navigationOpen.value = false
  }

  return { workspace, user, navigationOpen, closeNavigation }
})
