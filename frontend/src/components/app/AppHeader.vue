<script setup lang="ts">
import { useWorkspaceStore } from '../../stores/workspace'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import UserIdentity from './UserIdentity.vue'

const workspace = useWorkspaceStore()
</script>

<template>
  <header class="app-header">
    <div class="app-header__workspace">
      <IconButton
        class="app-header__menu"
        icon="menu"
        label="Open navigation"
        :aria-expanded="workspace.navigationOpen"
        aria-haspopup="dialog"
        @click="workspace.navigationOpen = true"
      />
      <AppIcon class="app-header__workspace-icon" name="company" :size="18" />
      <span class="app-header__workspace-name">{{
        workspace.workspace.name
      }}</span>
    </div>
    <div class="app-header__tools">
      <div class="app-header__search" title="Workspace search is coming soon">
        <AppIcon name="search" :size="18" />
        <input
          type="search"
          disabled
          aria-label="Search workspace (coming soon)"
          placeholder="Search workspace…"
        />
      </div>

      <div class="app-header__identity"><UserIdentity /></div>
    </div>
  </header>
</template>
