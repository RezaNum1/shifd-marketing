<script setup lang="ts">
import { useWorkspaceStore } from '../../stores/workspace'
const workspace = useWorkspaceStore()
</script>

<template>
  <div class="user-identity">
    <span class="user-avatar" aria-hidden="true">{{
      workspace.user.initials
    }}</span>
    <span class="user-identity__text"
      ><span class="font-medium">{{ workspace.user.name }}</span
      ><span class="text-label-md text-muted">{{
        workspace.user.role
      }}</span></span
    >
  </div>
</template>
