<script setup lang="ts">
import mark from '../../assets/shifd-mark.svg'
</script>

<template>
  <RouterLink to="/" class="app-brand" aria-label="Shifd Marketing overview">
    <img :src="mark" width="32" height="32" alt="" />
    <span
      ><span class="app-brand__name">Shifd Marketing</span
      ><span class="app-brand__subtitle">Shifd Labs Suite</span></span
    >
  </RouterLink>
</template>
