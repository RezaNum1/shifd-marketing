<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isApiError } from '../api/client'
import { getPublicReview, submitPublicReviewComment, type PublicReviewContent } from '../api/content'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'

const route = useRoute()
const content = ref<PublicReviewContent | null>(null)
const loading = ref(true)
const unavailable = ref(false)
const loadFailure = ref('')
const commentMessage = ref('')
const commentSending = ref(false)
const commentError = ref('')
const commentNotice = ref('')
const previewAsset = ref<PublicReviewContent['variants'][number]['assets'][number] | null>(null)
const previewOpen = ref(false)
let robotsMeta: HTMLMetaElement | null = null
let previousRobotsContent: string | null = null

async function load(token: string) {
  loading.value = true
  unavailable.value = false
  loadFailure.value = ''
  commentMessage.value = ''
  commentError.value = ''
  commentNotice.value = ''
  try {
    content.value = (await getPublicReview(token)).data
  } catch (error) {
    content.value = null
    if (isApiError(error) && error.status === 404) unavailable.value = true
    else loadFailure.value = 'The review could not be loaded. The server may be unavailable or need an update. Please try again later or contact the person who shared the link.'
  } finally {
    loading.value = false
  }
}

async function submitComment() {
  const message = commentMessage.value.trim()
  if (!message || !content.value) return
  commentSending.value = true
  commentError.value = ''
  commentNotice.value = ''
  try {
    const comment = (await submitPublicReviewComment(String(route.params.token), message)).data
    content.value.comments = [...content.value.comments, comment]
    commentMessage.value = ''
    commentNotice.value = 'Thanks. Your anonymous comment was submitted.'
  } catch {
    commentError.value = 'Your comment could not be submitted. Please try again.'
  } finally {
    commentSending.value = false
  }
}

function formatCommentDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
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
    <section v-else-if="unavailable || loadFailure || !content" class="public-review-state public-review-unavailable">
      <span class="public-review-state-icon"><AppIcon name="link" :size="22" /></span>
      <h1>{{ unavailable ? 'This review link is unavailable' : 'Could not load this review' }}</h1>
      <p>{{ unavailable ? 'It may have expired or been turned off by the person who shared it. Ask them for a new link.' : loadFailure }}</p>
      <button v-if="loadFailure" class="public-review-retry" type="button" @click="load(String(route.params.token))">Try again</button>
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
            <dl class="public-review-copy public-review-master-copy"><div><dt>Key message</dt><dd>{{ content.master.coreMessage }}</dd></div><div><dt>Hook</dt><dd>{{ content.master.hook }}</dd></div><div><dt>Body</dt><dd class="public-review-preserve">{{ content.master.body }}</dd></div><div><dt>Call to action</dt><dd>{{ content.master.cta }}</dd></div></dl>
          </section>
          <section v-if="content.visualDirection" class="public-review-card">
            <header><div><span class="public-review-eyebrow">03 · Creative direction</span><h2>Visual direction</h2></div><StatusBadge class="public-review-format-badge" tone="neutral">{{ content.visualDirection.format }}</StatusBadge></header>
            <div class="public-review-visual-details">
              <div class="public-review-visual-concept"><span class="public-review-field-label">Visual concept</span><p>{{ content.visualDirection.concept }}</p></div>
              <div class="public-review-visual-notes"><span class="public-review-field-label">Direction notes</span><p>{{ content.visualDirection.notes }}</p></div>
              <div v-if="content.visualDirection.structure.length" class="public-review-visual-structure">
                <span class="public-review-field-label">Composition</span>
                <p v-if="content.visualDirection.structure.length === 1" class="public-review-structure-single">{{ content.visualDirection.structure[0] }}</p>
                <ol v-else class="public-review-structure"><li v-for="(step, index) in content.visualDirection.structure" :key="`${index}-${step}`">{{ step }}</li></ol>
              </div>
            </div>
          </section>
          <section v-for="variant in content.variants" :key="variant.platform" class="public-review-card">
            <header><div><span class="public-review-eyebrow">04 · Platform version</span><h2>{{ platformName(variant.platform) }}</h2></div><StatusBadge v-if="variant.assessment" :tone="variant.assessment.status === 'Aligned' ? 'success' : 'warning'">{{ variant.assessment.status }} · {{ variant.assessment.score }}/100</StatusBadge></header>
            <dl class="public-review-copy public-review-variant-copy"><div><dt>Final copy</dt><dd class="public-review-preserve">{{ variant.copy || 'No copy added yet.' }}</dd></div><div v-if="variant.cta"><dt>Call to action</dt><dd>{{ variant.cta }}</dd></div><div v-if="variant.hashtags"><dt>Hashtags</dt><dd>{{ variant.hashtags }}</dd></div><div v-if="variant.visualRecommendation"><dt>Visual recommendation</dt><dd>{{ variant.visualRecommendation }}</dd></div></dl>
            <div v-if="variant.assets.length" class="public-review-assets"><figure v-for="(asset, index) in variant.assets" :key="asset.id"><button type="button" class="public-review-asset-button" :aria-label="`Preview ${asset.fileName}`" @click="openAssetPreview(asset)"><img :src="asset.contentUrl" :alt="`${platformName(variant.platform)} creative ${index + 1}`" /><span class="public-review-zoom-hint"><AppIcon name="search" :size="15" /> Preview</span></button><figcaption>{{ asset.fileName }}</figcaption></figure></div>
            <p v-else class="public-review-notes">No creative asset is attached yet.</p>
            <div v-if="variant.assessment" class="public-review-assessment"><strong>AI brand check <small>Advisory</small></strong><p>{{ variant.assessment.recommendation }}</p><ul><li v-for="check in variant.assessment.checks" :key="check.label"><span>{{ check.label }}</span><StatusBadge :tone="check.status === 'pass' ? 'success' : check.status === 'warning' ? 'warning' : 'info'">{{ check.status === 'pass' ? 'Pass' : check.status === 'warning' ? 'Warning' : 'Not analyzed' }}</StatusBadge></li></ul></div>
          </section>
          <section class="public-review-card public-review-comments">
            <header><div><span class="public-review-eyebrow">05 · External feedback</span><h2>Anonymous comments</h2></div></header>
            <p class="public-review-notes">Comments are anonymous and will be visible to the content owner in the Review step.</p>
            <ul v-if="content.comments.length" class="public-review-comment-list"><li v-for="comment in content.comments" :key="comment.id"><div><strong>Anonymous reviewer</strong><time :datetime="comment.createdAt">{{ formatCommentDate(comment.createdAt) }}</time></div><p>{{ comment.message }}</p></li></ul>
            <p v-else class="public-review-empty-comments">No comments yet. Share your feedback below.</p>
            <form class="public-review-comment-form" @submit.prevent="submitComment"><label for="public-review-comment">Your comment</label><textarea id="public-review-comment" v-model="commentMessage" rows="5" maxlength="5000" required placeholder="Write feedback about this content…" :disabled="commentSending" /><small>{{ commentMessage.length }} / 5,000 characters · No name or sign-in required</small><p v-if="commentError" class="public-review-comment-error" role="alert">{{ commentError }}</p><p v-if="commentNotice" class="public-review-comment-success" role="status">{{ commentNotice }}</p><button type="submit" :disabled="commentSending || !commentMessage.trim()">{{ commentSending ? 'Submitting…' : 'Submit comment' }}</button></form>
          </section>
        </div>
      </div>
      <footer class="public-review-footer"><AppIcon name="lock" :size="15" /> This page is for anonymous feedback only. The content owner retains control of the content and approval.</footer>
      <BaseModal v-model="previewOpen" :title="previewAsset?.fileName ?? 'Creative preview'" description="Full-size view · Read only" size="fullscreen">
        <div v-if="previewAsset" class="public-review-large-preview"><img :src="previewAsset.contentUrl" :alt="previewAsset.fileName" /><span>{{ previewAsset.width }} × {{ previewAsset.height }}</span></div>
      </BaseModal>
    </template>
  </main>
</template>

<style scoped>
.public-review-page { min-height: 100vh; padding: 0 clamp(16px, 3vw, 24px) 48px; background: #f6f8fc; color: #17243b; }
.public-review-topbar { display: flex; height: 64px; align-items: center; justify-content: space-between; max-width: 960px; margin: 0 auto; border-bottom: 1px solid #e4e9f2; }
.public-review-brand { display: inline-flex; align-items: center; gap: 9px; color: #17243b; font-size: 14px; font-weight: 650; text-decoration: none; }
.public-review-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; background: #1e63d6; color: white; font-size: 14px; }
.public-review-mode { display: inline-flex; align-items: center; gap: 6px; color: #58677e; font-size: 12px; font-weight: 600; }
.public-review-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; max-width: 960px; margin: 38px auto 24px; }
.public-review-hero h1 { margin: 6px 0 8px; color: #14243b; font-size: clamp(28px, 4vw, 38px); line-height: 1.15; font-weight: 750; letter-spacing: -.03em; overflow-wrap: anywhere; }
.public-review-hero p, .public-review-notes { margin: 0; color: #66748a; font-size: 13px; line-height: 20px; }
.public-review-eyebrow { color: #66748a; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.public-review-layout { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 20px; max-width: 960px; margin: 0 auto; }
.public-review-main { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.public-review-card, .public-review-aside { padding: 28px; border: 1px solid #e3e8f1; border-radius: 16px; background: white; box-shadow: 0 2px 8px rgb(20 36 59 / .025); }
.public-review-card > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #edf0f5; }
.public-review-card h2, .public-review-aside h2 { margin: 4px 0 0; color: #192a43; font-size: 20px; line-height: 27px; font-weight: 750; letter-spacing: -.015em; overflow-wrap: anywhere; }
.public-review-brief { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; margin: 0; }
.public-review-brief > div { min-width: 0; padding: 16px 0; border-top: 1px solid #edf0f5; }
.public-review-brief > div:nth-child(-n+2) { padding-top: 0; border-top: 0; }
.public-review-brief > div:nth-child(n+5) { grid-column: 1 / -1; }
.public-review-copy { display: flex; flex-direction: column; gap: 0; margin: 0; }
.public-review-copy > div { display: grid; grid-template-columns: minmax(135px, .28fr) minmax(0, 1fr); align-items: start; gap: 24px; min-width: 0; padding: 18px 0; border-top: 1px solid #edf0f5; }
.public-review-copy > div:first-child { padding-top: 0; border-top: 0; }
.public-review-brief dt, .public-review-copy dt { margin: 0; color: #728097; font-size: 11px; font-weight: 700; line-height: 17px; letter-spacing: .035em; text-transform: uppercase; }
.public-review-brief dd, .public-review-copy dd { min-width: 0; margin: 0; color: #29384e; font-size: 14px; font-weight: 400; line-height: 1.75; overflow-wrap: anywhere; }
.public-review-brief dd { font-weight: 500; }
.public-review-variant-copy > div:first-child dd { padding: 18px 20px; border: 1px solid #e5eaf2; border-radius: 10px; background: #f7f9fd; font-size: 15px; line-height: 1.8; }
.public-review-preserve { white-space: pre-wrap; }
.public-review-format-badge { flex: 0 0 auto; white-space: nowrap; }
.public-review-visual-details { display: grid; gap: 16px; }
.public-review-field-label { display: block; margin-bottom: 7px; color: #728097; font-size: 11px; font-weight: 700; line-height: 17px; letter-spacing: .035em; text-transform: uppercase; }
.public-review-visual-concept { padding: 18px 20px; border: 1px solid #e5eaf2; border-radius: 10px; background: #f7f9fd; }
.public-review-visual-concept p { margin: 0; color: #29384e; font-size: 16px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.public-review-visual-notes p { max-width: 820px; margin: 0; color: #596981; font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
.public-review-visual-structure { padding-top: 2px; }
.public-review-structure-single { margin: 0; padding-left: 14px; border-left: 2px solid #c9d8f2; color: #34445c; font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
.public-review-structure { display: flex; flex-direction: column; gap: 9px; margin: 16px 0 0; padding-left: 22px; color: #34445c; font-size: 14px; line-height: 22px; }
.public-review-comment-list { display: grid; gap: 12px; margin: 20px 0; padding: 0; list-style: none; }
.public-review-comment-list li { padding: 16px 18px; border: 1px solid #e5eaf2; border-radius: 10px; background: #fbfcfe; }
.public-review-comment-list li > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.public-review-comment-list strong { color: #34445c; font-size: 12px; }
.public-review-comment-list time, .public-review-comment-form small { color: #7a879a; font-size: 11px; }
.public-review-comment-list p { margin: 8px 0 0; color: #29384e; font-size: 14px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.public-review-empty-comments { margin: 18px 0; color: #748197; font-size: 13px; }
.public-review-comment-form { display: grid; gap: 9px; padding-top: 18px; border-top: 1px solid #edf0f5; }
.public-review-comment-form label { color: #34445c; font-size: 13px; font-weight: 650; }
.public-review-comment-form textarea { width: 100%; min-height: 120px; resize: vertical; padding: 11px 12px; border: 1px solid #ccd6e4; border-radius: 9px; background: white; color: #29384e; font: inherit; font-size: 13px; line-height: 20px; }
.public-review-comment-form textarea:focus { outline: 2px solid #8aaeff; outline-offset: 1px; }
.public-review-comment-form button { justify-self: start; padding: 10px 15px; border: 0; border-radius: 8px; background: #1e63d6; color: white; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.public-review-comment-form button:disabled { opacity: .55; cursor: not-allowed; }
.public-review-comment-error { margin: 0; color: #a13c36; font-size: 12px; }
.public-review-comment-success { margin: 0; color: #21694d; font-size: 12px; font-weight: 600; }
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
.public-review-footer { display: flex; align-items: center; justify-content: center; gap: 7px; max-width: 960px; margin: 26px auto 0; color: #7c899b; font-size: 11px; }
.public-review-state { display: flex; min-height: calc(100vh - 100px); flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #66748a; text-align: center; }
.public-review-state h1 { margin: 4px 0 0; color: #192a43; font-size: 24px; }
.public-review-state p { max-width: 430px; margin: 0; font-size: 13px; line-height: 20px; }
.public-review-state-icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 14px; background: white; color: #6d7d95; }
.public-review-retry { padding: 9px 14px; border: 1px solid #cbd7e8; border-radius: 8px; background: white; color: #2859a8; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.public-review-spinner { width: 22px; height: 22px; border: 2px solid #dce5f5; border-top-color: #2863cb; border-radius: 50%; animation: public-review-spin .8s linear infinite; }
@keyframes public-review-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .public-review-page { padding-inline: 16px; } .public-review-hero { align-items: flex-start; flex-direction: column; margin-top: 26px; } .public-review-layout { grid-template-columns: 1fr; } .public-review-aside { position: static; grid-row: 1; } }
@media (max-width: 520px) { .public-review-brief { grid-template-columns: 1fr; } .public-review-brief > div:nth-child(2) { padding-top: 16px; border-top: 1px solid #edf0f5; } .public-review-brief > div:nth-child(n+5) { grid-column: auto; } .public-review-copy > div { grid-template-columns: 1fr; gap: 6px; } .public-review-card, .public-review-aside { padding: 18px; } .public-review-assets { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
