<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkspaceStore } from '../../stores/workspace'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import AppNavigation from './AppNavigation.vue'
import AppToastRegion from './AppToastRegion.vue'
import UserIdentity from './UserIdentity.vue'
import PageContainer from './PageContainer.vue'
import BaseDrawer from '../ui/BaseDrawer.vue'

const route = useRoute()
const workspace = useWorkspaceStore()
let desktop: MediaQueryList | undefined

function onViewportChange() {
  if (desktop?.matches) workspace.closeNavigation()
}

watch(
  () => route.path,
  async () => {
    workspace.closeNavigation()
    await nextTick()
    requestAnimationFrame(() =>
      document.getElementById('main-content')?.focus({ preventScroll: true }),
    )
  },
)

onMounted(() => {
  desktop = window.matchMedia('(min-width: 1024px)')
  desktop.addEventListener('change', onViewportChange)
})
onBeforeUnmount(() => desktop?.removeEventListener('change', onViewportChange))
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <AppSidebar />
    <div class="app-shell__body">
      <AppHeader />
      <main id="main-content" class="app-main" tabindex="-1">
        <PageContainer><RouterView /></PageContainer>
      </main>
    </div>
    <BaseDrawer
      v-model="workspace.navigationOpen"
      title="Navigation"
      side="left"
      size="navigation"
    >
      <AppNavigation />
      <template #footer><UserIdentity /></template>
    </BaseDrawer>
    <AppToastRegion />
  </div>
</template>
