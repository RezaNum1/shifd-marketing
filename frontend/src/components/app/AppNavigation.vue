<script setup lang="ts">
import { useRoute } from 'vue-router'
import { navigationGroups } from '../../router/navigation'
import { useWorkspaceStore } from '../../stores/workspace'
import AppIcon from '../ui/AppIcon.vue'

const route = useRoute()
const workspace = useWorkspaceStore()

function onNavigate(event: MouseEvent, navigate: (event: MouseEvent) => unknown) {
  navigate(event)
  workspace.closeNavigation()
}
</script>

<template>
  <nav aria-label="Main navigation" class="app-navigation">
    <div
      v-for="group in navigationGroups"
      :key="group.label"
      class="app-navigation__group"
    >
      <p class="app-navigation__heading">{{ group.label }}</p>
      <ul>
        <li v-for="item in group.items" :key="item.key">
          <RouterLink :to="item.to" custom v-slot="{ href, navigate }">
            <a
              :href="href"
              class="app-nav-item"
              :class="{ 'is-active': route.meta.navigationKey === item.key }"
              :aria-current="
                route.meta.navigationKey === item.key ? 'page' : undefined
              "
              @click="onNavigate($event, navigate)"
            >
              <AppIcon :name="item.icon" /><span>{{ item.label }}</span>
            </a>
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
