<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BackendCreativeReference } from '../../types/backend'
import { createCanvaReadyZip } from '../../utils/canvaReadyExport'
import BaseButton from '../ui/BaseButton.vue'
import InlineAlert from '../ui/InlineAlert.vue'

const props = defineProps<{ reference: BackendCreativeReference; headline: string; subtitle: string; cta: string; slideNumber: number | null; slideCount: number }>()
const heroX = ref(47)
const heroY = ref(47)
const heroScale = ref(0.48)
const textX = ref(8)
const textY = ref(9)
const exporting = ref(false)
const error = ref('')
const isCarousel = computed(() => props.slideNumber !== null)
const displayHeadline = computed(() => concise(
  isCarousel.value ? props.reference.conceptName.replace(/^slide\s*\d+\s*[:—-]\s*/i, '') : props.headline || props.reference.conceptName,
  42,
))
const displaySubtitle = computed(() => {
  const value = isCarousel.value
    ? (props.reference.slideCopy || props.subtitle).replace(/^slide\s*\d+\s*[:—-]\s*/i, '')
    : props.subtitle || props.reference.rationale
  return concise(value.split(/(?<=[.!?])\s/)[0] ?? value, 72)
})
const displayCta = computed(() => isCarousel.value && props.slideNumber !== props.slideCount ? '' : concise(props.cta, 40))
const eyebrow = computed(() => isCarousel.value ? `${String(props.slideNumber).padStart(2, '0')} / ${String(props.slideCount).padStart(2, '0')}` : 'SHIFD LABS  ·  DESIGN IDEA')

async function exportZip() {
  if (exporting.value) return
  exporting.value = true
  error.value = ''
  let url: string | null = null
  try {
    const response = await fetch(props.reference.imageUrl, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Could not load the original generated illustration.')
    const hero = await response.blob()
    const bitmap = await createImageBitmap(hero)
    let zip: Blob
    try {
      zip = await createCanvaReadyZip({ referenceId: props.reference.id, hero, width: bitmap.width, height: bitmap.height, headline: displayHeadline.value, subtitle: displaySubtitle.value, cta: displayCta.value, eyebrow: eyebrow.value, heroX: heroX.value, heroY: heroY.value, heroScale: heroScale.value, textX: textX.value, textY: textY.value })
    } finally { bitmap.close() }
    url = URL.createObjectURL(zip)
    const link = document.createElement('a')
    link.href = url
    link.download = `canva-ready-${props.reference.id}.zip`
    link.click()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create the Canva-ready ZIP.'
  } finally {
    if (url) window.setTimeout(() => URL.revokeObjectURL(url!), 1000)
    exporting.value = false
  }
}

function concise(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  const prefix = normalized.slice(0, limit - 1)
  const lastSpace = prefix.lastIndexOf(' ')
  return `${prefix.slice(0, lastSpace > limit * 0.65 ? lastSpace : limit - 1).trimEnd()}…`
}
</script>

<template>
  <section class="canva-ready-composer" :aria-label="`Canva-ready composition for ${reference.conceptName}`">
    <div class="canva-ready-preview" :class="{ 'is-carousel': isCarousel }" :style="{ aspectRatio: `${reference.width ?? 1024} / ${reference.height ?? 1536}` }">
      <svg class="canva-ready-decor" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><circle class="canva-ready-halo" cx="76" cy="73" r="21"/><path d="M8 137h18M8 140h11M87 17h5M89.5 14.5v5"/><circle class="canva-ready-dot" cx="9" cy="9" r="1.1"/><circle class="canva-ready-dot canva-ready-dot--soft" cx="13" cy="9" r=".6"/></svg>
      <img class="canva-ready-hero" :src="reference.imageUrl" :alt="reference.visualFocus" :style="{ left: `${heroX}%`, top: `${heroY}%`, height: `${heroScale * 100}%` }" />
      <div class="canva-ready-copy" :style="{ left: `${textX}%`, top: `${textY}%` }">
        <span class="canva-ready-eyebrow">{{ eyebrow }}</span>
        <strong>{{ displayHeadline }}</strong>
        <span class="canva-ready-subtitle">{{ displaySubtitle }}</span>
        <em v-if="displayCta">{{ displayCta }}</em>
      </div>
    </div>
    <details class="canva-ready-controls">
      <summary>Adjust illustration and text layout</summary>
      <label>Illustration size <input v-model.number="heroScale" type="range" min="0.32" max="0.62" step="0.01" /></label>
      <label>Illustration horizontal position <input v-model.number="heroX" type="range" min="35" max="58" /></label>
      <label>Illustration vertical position <input v-model.number="heroY" type="range" min="41" max="57" /></label>
      <label>Text horizontal position <input v-model.number="textX" type="range" min="6" max="16" /></label>
      <label>Text vertical position <input v-model.number="textY" type="range" min="7" max="14" /></label>
    </details>
    <p class="canva-ready-layer-note">A stylized GPT illustration stays as one high-resolution transparent PNG. Background, decoration, and editable text specifications are separate files.</p>
    <InlineAlert v-if="error" title="Canva-ready export" tone="warning">{{ error }}</InlineAlert>
    <BaseButton size="compact" :loading="exporting" :disabled="exporting" @click="exportZip">Download Canva-ready ZIP</BaseButton>
  </section>
</template>
