<script setup lang="ts">
import AppBrand from './AppBrand.vue'
import AppNavigation from './AppNavigation.vue'
import UserIdentity from './UserIdentity.vue'
import IconButton from '../ui/IconButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
function signOut() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <aside class="app-sidebar" aria-label="Workspace sidebar">
    <div class="app-sidebar__brand"><AppBrand /></div>
    <AppNavigation />
    <div class="app-sidebar__footer">
      <UserIdentity />
      <div class="app-sidebar__footer-actions">
        <IconButton icon="arrow-left" label="Sign out" @click="signOut" />
      </div>
    </div>
  </aside>
</template>
