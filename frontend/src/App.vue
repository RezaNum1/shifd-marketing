<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/app/AppShell.vue'
import { language } from './i18n/language'
import { installDomTranslator } from './i18n/domTranslator'
const route = useRoute()
let stopTranslation: (() => void) | undefined
onMounted(() => {
  stopTranslation = installDomTranslator(document.body, language)
})
onBeforeUnmount(() => stopTranslation?.())
</script>

<template>
  <RouterView v-if="route.name === 'login' || route.name === 'public-review'" />
  <AppShell v-else />
</template>
