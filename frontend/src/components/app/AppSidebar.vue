<script setup lang="ts">
import AppBrand from './AppBrand.vue'
import AppNavigation from './AppNavigation.vue'
import UserIdentity from './UserIdentity.vue'
import AppIcon from '../ui/AppIcon.vue'
</script>

<template>
  <aside class="app-sidebar" aria-label="Workspace sidebar">
    <div class="app-sidebar__brand"><AppBrand /></div>
    <AppNavigation />
    <div class="app-sidebar__footer">
      <UserIdentity />
      <RouterLink
        to="/settings/ai"
        class="ui-button ui-button--ghost ui-icon-button"
        aria-label="Workspace settings"
        title="Workspace settings"
        ><AppIcon name="settings" :size="18"
      /></RouterLink>
    </div>
  </aside>
</template>
