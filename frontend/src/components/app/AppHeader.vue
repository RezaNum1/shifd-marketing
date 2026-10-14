<script setup lang="ts">
import { useWorkspaceStore } from '../../stores/workspace'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import { language } from '../../i18n/language'

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
      <label class="language-picker">
        <span class="language-picker__flag" aria-hidden="true">{{ language === 'id' ? '🇮🇩' : '🇺🇸' }}</span>
        <select v-model="language" :aria-label="language === 'id' ? 'Bahasa' : 'Language'">
          <option value="en">English</option>
          <option value="id">Indonesia</option>
        </select>
      </label>
    </div>
  </header>
</template>
