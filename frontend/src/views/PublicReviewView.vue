<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicReview, type PublicReviewContent } from '../api/content'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'

const route = useRoute()
const content = ref<PublicReviewContent | null>(null)
const loading = ref(true)
const unavailable = ref(false)
const previewAsset = ref<PublicReviewContent['variants'][number]['assets'][number] | null>(null)
const previewOpen = ref(false)
let robotsMeta: HTMLMetaElement | null = null
let previousRobotsContent: string | null = null

async function load(token: string) {
  loading.value = true
  unavailable.value = false
  try {
    content.value = (await getPublicReview(token)).data
  } catch {
    content.value = null
    unavailable.value = true
  } finally {
    loading.value = false
  }
}

function platformName(platform: string) {
  return platform === 'instagram' ? 'Instagram' : 'LinkedIn'
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

function openAssetPreview(asset: PublicReviewContent['variants'][number]['assets'][number]) {
  previewAsset.value = asset
  previewOpen.value = true
}

onMounted(() => {
  robotsMeta = document.querySelector('meta[name="robots"]')
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta')
    robotsMeta.name = 'robots'
    document.head.append(robotsMeta)
  } else previousRobotsContent = robotsMeta.content
  robotsMeta.content = 'noindex, nofollow'
  void load(String(route.params.token))
})
onBeforeUnmount(() => {
  if (!robotsMeta) return
  if (previousRobotsContent === null) robotsMeta.remove()
  else robotsMeta.content = previousRobotsContent
})
watch(() => String(route.params.token), (token) => { void load(token) })
</script>

<template>
  <main class="public-review-page">
    <header class="public-review-topbar"><a class="public-review-brand" href="/" aria-label="Shifd Marketing"><span class="public-review-mark">S</span><span>Shifd Marketing</span></a><span class="public-review-mode"><AppIcon name="eye" :size="15" /> View only</span></header>
    <div v-if="loading" class="public-review-state"><div class="public-review-spinner" /><strong>Loading shared review…</strong></div>
    <section v-else-if="unavailable || !content" class="public-review-state public-review-unavailable">
      <span class="public-review-state-icon"><AppIcon name="link" :size="22" /></span>
      <h1>This review link is unavailable</h1>
      <p>It may have expired or been turned off by the person who shared it. Ask them for a new link.</p>
    </section>
    <template v-else>
      <section class="public-review-hero">
        <div><span class="public-review-eyebrow">Shared content review</span><h1>{{ content.title }}</h1><p>Review the current draft and creative. This private link expires {{ formatDate(content.expiresAt) }}.</p></div>
        <StatusBadge tone="info" dot>View only</StatusBadge>
      </section>
      <div class="public-review-layout">
        <div class="public-review-main">
          <section class="public-review-card">
            <header><div><span class="public-review-eyebrow">01 · Brief</span><h2>What this content is for</h2></div></header>
            <dl class="public-review-brief"><div><dt>Topic</dt><dd>{{ content.brief.topic }}</dd></div><div><dt>Audience</dt><dd>{{ content.brief.targetAudience }}</dd></div><div><dt>Objective</dt><dd>{{ content.brief.objective }}</dd></div><div><dt>Content pillar</dt><dd>{{ content.brief.pillarCode }}</dd></div><div v-if="content.brief.angle"><dt>Angle</dt><dd>{{ content.brief.angle }}</dd></div><div v-if="content.brief.additionalInstructions"><dt>Instructions</dt><dd>{{ content.brief.additionalInstructions }}</dd></div></dl>
          </section>
          <section v-if="content.master" class="public-review-card">
            <header><div><span class="public-review-eyebrow">02 · Core message</span><h2>{{ content.master.title }}</h2></div></header>
            <dl class="public-review-copy"><div><dt>Key message</dt><dd>{{ content.master.coreMessage }}</dd></div><div><dt>Hook</dt><dd>{{ content.master.hook }}</dd></div><div><dt>Body</dt><dd class="public-review-preserve">{{ content.master.body }}</dd></div><div><dt>Call to action</dt><dd>{{ content.master.cta }}</dd></div></dl>
          </section>
          <section v-if="content.visualDirection" class="public-review-card">
            <header><div><span class="public-review-eyebrow">03 · Creative direction</span><h2>{{ content.visualDirection.concept }}</h2></div><StatusBadge tone="neutral">{{ content.visualDirection.format }}</StatusBadge></header>
            <p class="public-review-notes">{{ content.visualDirection.notes }}</p>
            <ol class="public-review-structure"><li v-for="(step, index) in content.visualDirection.structure" :key="`${index}-${step}`">{{ step }}</li></ol>
          </section>
          <section v-for="variant in content.variants" :key="variant.platform" class="public-review-card">
            <header><div><span class="public-review-eyebrow">04 · Platform version</span><h2>{{ platformName(variant.platform) }}</h2></div><StatusBadge v-if="variant.assessment" :tone="variant.assessment.status === 'Aligned' ? 'success' : 'warning'">{{ variant.assessment.status }} · {{ variant.assessment.score }}/100</StatusBadge></header>
            <div class="public-review-copy"><div><dt>Final copy</dt><dd class="public-review-preserve">{{ variant.copy || 'No copy added yet.' }}</dd></div><div v-if="variant.cta"><dt>Call to action</dt><dd>{{ variant.cta }}</dd></div><div v-if="variant.hashtags"><dt>Hashtags</dt><dd>{{ variant.hashtags }}</dd></div><div v-if="variant.visualRecommendation"><dt>Visual recommendation</dt><dd>{{ variant.visualRecommendation }}</dd></div></div>
            <div v-if="variant.assets.length" class="public-review-assets"><figure v-for="(asset, index) in variant.assets" :key="asset.id"><button type="button" class="public-review-asset-button" :aria-label="`Preview ${asset.fileName}`" @click="openAssetPreview(asset)"><img :src="asset.contentUrl" :alt="`${platformName(variant.platform)} creative ${index + 1}`" /><span class="public-review-zoom-hint"><AppIcon name="search" :size="15" /> Preview</span></button><figcaption>{{ asset.fileName }}</figcaption></figure></div>
            <p v-else class="public-review-notes">No creative asset is attached yet.</p>
            <div v-if="variant.assessment" class="public-review-assessment"><strong>AI brand check <small>Advisory</small></strong><p>{{ variant.assessment.recommendation }}</p><ul><li v-for="check in variant.assessment.checks" :key="check.label"><span>{{ check.label }}</span><StatusBadge :tone="check.status === 'pass' ? 'success' : check.status === 'warning' ? 'warning' : 'info'">{{ check.status === 'pass' ? 'Pass' : check.status === 'warning' ? 'Warning' : 'Not analyzed' }}</StatusBadge></li></ul></div>
          </section>
        </div>
        <aside class="public-review-aside"><span class="public-review-aside-icon"><AppIcon name="eye" :size="18" /></span><h2>Feedback view</h2><p>This page is read-only. The content owner will complete the final review checklist and make the approval decision in their account.</p><div class="public-review-aside-detail"><strong>Last updated</strong><span>{{ formatDate(content.updatedAt) }}</span></div><div class="public-review-aside-detail"><strong>Link expires</strong><span>{{ formatDate(content.expiresAt) }}</span></div></aside>
      </div>
      <footer class="public-review-footer"><AppIcon name="lock" :size="15" /> This link gives view access to this content only. The owner can disable it at any time.</footer>
      <BaseModal v-model="previewOpen" :title="previewAsset?.fileName ?? 'Creative preview'" description="Full-size view · Read only" size="fullscreen">
        <div v-if="previewAsset" class="public-review-large-preview"><img :src="previewAsset.contentUrl" :alt="previewAsset.fileName" /><span>{{ previewAsset.width }} × {{ previewAsset.height }}</span></div>
      </BaseModal>
    </template>
  </main>
</template>

<style scoped>
.public-review-page { min-height: 100vh; padding: 0 24px 48px; background: #f6f8fc; color: #17243b; }
.public-review-topbar { display: flex; height: 64px; align-items: center; justify-content: space-between; max-width: 1160px; margin: 0 auto; border-bottom: 1px solid #e4e9f2; }
.public-review-brand { display: inline-flex; align-items: center; gap: 9px; color: #17243b; font-size: 14px; font-weight: 650; text-decoration: none; }
.public-review-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; background: #1e63d6; color: white; font-size: 14px; }
.public-review-mode { display: inline-flex; align-items: center; gap: 6px; color: #58677e; font-size: 12px; font-weight: 600; }
.public-review-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; max-width: 1160px; margin: 38px auto 24px; }
.public-review-hero h1 { margin: 6px 0 8px; color: #14243b; font-size: clamp(26px, 4vw, 36px); line-height: 1.15; letter-spacing: -.03em; }
.public-review-hero p, .public-review-notes { margin: 0; color: #66748a; font-size: 13px; line-height: 20px; }
.public-review-eyebrow { color: #66748a; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.public-review-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; align-items: start; gap: 20px; max-width: 1160px; margin: 0 auto; }
.public-review-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.public-review-card, .public-review-aside { padding: 20px; border: 1px solid #e3e8f1; border-radius: 14px; background: white; box-shadow: 0 2px 8px rgb(20 36 59 / .025); }
.public-review-card > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
.public-review-card h2, .public-review-aside h2 { margin: 4px 0 0; color: #192a43; font-size: 17px; line-height: 23px; }
.public-review-brief, .public-review-copy { display: grid; gap: 14px; margin: 0; }
.public-review-brief { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.public-review-brief div, .public-review-copy div { min-width: 0; }
.public-review-brief dt, .public-review-copy dt { margin-bottom: 5px; color: #7a879a; font-size: 11px; font-weight: 600; }
.public-review-brief dd, .public-review-copy dd { margin: 0; color: #29384e; font-size: 13px; line-height: 20px; }
.public-review-preserve { white-space: pre-wrap; }
.public-review-structure { display: flex; flex-direction: column; gap: 7px; margin: 14px 0 0; padding-left: 22px; color: #34445c; font-size: 13px; line-height: 19px; }
.public-review-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
.public-review-assets figure { min-width: 0; margin: 0; }
.public-review-asset-button { position: relative; display: block; width: 100%; overflow: hidden; padding: 0; border: 1px solid #e5eaf2; border-radius: 10px; background: #f2f5fa; cursor: zoom-in; }
.public-review-assets img { display: block; width: 100%; max-height: 400px; aspect-ratio: 4 / 5; object-fit: contain; }
.public-review-zoom-hint { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; border-radius: 6px; background: rgb(20 36 59 / .82); color: white; font-size: 10px; opacity: 0; transition: opacity 120ms ease; }
.public-review-asset-button:hover .public-review-zoom-hint, .public-review-asset-button:focus-visible .public-review-zoom-hint { opacity: 1; }
.public-review-asset-button:focus-visible { outline: 3px solid #8aaeff; outline-offset: 2px; }
.public-review-large-preview { position: relative; display: flex; width: 100%; height: 100%; min-height: 0; align-items: center; justify-content: center; overflow: hidden; border-radius: 10px; background: #f1f4f9; }
.public-review-large-preview img { display: block; width: auto; height: auto; max-width: 100%; max-height: calc(100dvh - 190px); object-fit: contain; image-rendering: auto; }
.public-review-large-preview > span { position: absolute; right: 10px; bottom: 10px; padding: 5px 8px; border-radius: 6px; background: rgb(20 36 59 / .78); color: white; font-size: 10px; }
.public-review-assets figcaption { overflow: hidden; margin-top: 6px; color: #748197; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.public-review-assessment { margin-top: 18px; padding: 14px; border-radius: 10px; background: #f6f8fc; }
.public-review-assessment > strong { display: flex; justify-content: space-between; color: #334259; font-size: 12px; }
.public-review-assessment small { color: #758299; font-size: 10px; font-weight: 500; }
.public-review-assessment p { margin: 8px 0 10px; color: #647187; font-size: 12px; line-height: 18px; }
.public-review-assessment ul { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.public-review-assessment li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 5px; border-top: 1px solid #e5eaf2; color: #58677e; font-size: 11px; }
.public-review-aside { position: sticky; top: 16px; }
.public-review-aside-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; background: #edf3ff; color: #2863cb; }
.public-review-aside p { margin: 8px 0 18px; color: #66748a; font-size: 12px; line-height: 18px; }
.public-review-aside-detail { display: flex; flex-direction: column; gap: 3px; padding: 11px 0; border-top: 1px solid #edf0f5; }
.public-review-aside-detail strong { color: #7a879a; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.public-review-aside-detail span { color: #34445c; font-size: 12px; }
.public-review-footer { display: flex; align-items: center; justify-content: center; gap: 7px; max-width: 1160px; margin: 22px auto 0; color: #7c899b; font-size: 11px; }
.public-review-state { display: flex; min-height: calc(100vh - 100px); flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #66748a; text-align: center; }
.public-review-state h1 { margin: 4px 0 0; color: #192a43; font-size: 24px; }
.public-review-state p { max-width: 430px; margin: 0; font-size: 13px; line-height: 20px; }
.public-review-state-icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 14px; background: white; color: #6d7d95; }
.public-review-spinner { width: 22px; height: 22px; border: 2px solid #dce5f5; border-top-color: #2863cb; border-radius: 50%; animation: public-review-spin .8s linear infinite; }
@keyframes public-review-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .public-review-page { padding-inline: 16px; } .public-review-hero { align-items: flex-start; flex-direction: column; margin-top: 26px; } .public-review-layout { grid-template-columns: 1fr; } .public-review-aside { position: static; grid-row: 1; } }
@media (max-width: 520px) { .public-review-brief { grid-template-columns: 1fr; } .public-review-card, .public-review-aside { padding: 16px; } .public-review-assets { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
