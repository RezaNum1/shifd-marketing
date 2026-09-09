<script setup lang="ts">
defineProps<{ title?: string; description?: string }>()
</script>

<template>
  <section class="ui-card">
    <header
      v-if="title || $slots.header || $slots.actions"
      class="ui-card__header"
    >
      <slot name="header">
        <div>
          <h2 v-if="title" class="text-headline-sm font-semibold">
            {{ title }}
          </h2>
          <p v-if="description" class="mt-1 text-body-sm text-muted">
            {{ description }}
          </p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="ui-card__body"><slot /></div>
    <footer v-if="$slots.footer" class="ui-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>
