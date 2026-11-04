<script setup lang="ts">
import AppBrand from './AppBrand.vue'
import AppNavigation from './AppNavigation.vue'
import UserIdentity from './UserIdentity.vue'
import BaseButton from '../ui/BaseButton.vue'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useWorkspaceStore } from '../../stores/workspace'
import { useRouter } from 'vue-router'

defineProps<{ visible: boolean }>()

const auth = useAuthStore()
const workspace = useWorkspaceStore()
const router = useRouter()

function onPointerEnter() {
  workspace.showSidebarPreview()
}

function onPointerLeave() {
  workspace.hideSidebarPreview()
}

async function signOut() {
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <aside
    id="workspace-sidebar"
    class="app-sidebar"
    aria-label="Workspace sidebar"
    :aria-hidden="!visible"
    :inert="!visible"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <div class="app-sidebar__brand">
      <AppBrand />
      <IconButton
        v-if="!workspace.sidebarPinned"
        class="app-sidebar__pin"
        icon="pin"
        label="Pin sidebar"
        @click="workspace.pinSidebar()"
      />
    </div>
    <AppNavigation />
    <div class="app-sidebar__footer">
      <UserIdentity />
      <BaseButton variant="secondary" size="compact" class="app-sidebar__sign-out" @click="signOut">
        <AppIcon name="arrow-left" :size="16" />
        <span>Sign out</span>
      </BaseButton>
    </div>
  </aside>
</template>
