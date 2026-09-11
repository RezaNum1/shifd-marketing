<script setup lang="ts">
import { useWorkspaceStore } from '../../stores/workspace'
import { useAuthStore } from '../../stores/auth'
const workspace = useWorkspaceStore()
const auth = useAuthStore()
</script>

<template>
  <div class="user-identity">
    <span class="user-avatar" aria-hidden="true">{{ auth.user?.initials ?? workspace.user.initials }}</span>
    <span class="user-identity__text"
      ><span class="font-medium">{{ auth.user?.name ?? workspace.user.name }}</span
      ><span class="text-label-md text-muted">{{
        auth.user?.role ?? workspace.user.role
      }}</span></span
    >
  </div>
</template>
