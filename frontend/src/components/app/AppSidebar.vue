<script setup lang="ts">
import AppBrand from './AppBrand.vue'
import AppNavigation from './AppNavigation.vue'
import UserIdentity from './UserIdentity.vue'
import BaseButton from '../ui/BaseButton.vue'
import AppIcon from '../ui/AppIcon.vue'
import { useAuthStore } from '../../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
async function signOut() {
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <aside class="app-sidebar" aria-label="Workspace sidebar">
    <div class="app-sidebar__brand"><AppBrand /></div>
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
