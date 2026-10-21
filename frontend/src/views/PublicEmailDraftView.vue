<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicEmailDraft, submitPublicEmailDraftFeedback } from '../api/prospects'
import AppIcon from '../components/ui/AppIcon.vue'

const route = useRoute()
const email = ref<{ subject: string; body: string } | null>(null)
const loading = ref(true)
const unavailable = ref(false)
const feedbackMessage = ref('')
const feedbackSending = ref(false)
const feedbackSent = ref(false)
const feedbackError = ref('')
let robotsMeta: HTMLMetaElement | null = null
let previousRobotsContent: string | null = null

async function load(token: string) {
  loading.value = true
  unavailable.value = false
  feedbackSent.value = false
  feedbackMessage.value = ''
  feedbackError.value = ''
  try { email.value = (await getPublicEmailDraft(token)).data }
  catch { email.value = null; unavailable.value = true }
  finally { loading.value = false }
}

async function sendFeedback() {
  const message = feedbackMessage.value.trim()
  if (!message) { feedbackError.value = 'Please enter your feedback.'; return }
  feedbackSending.value = true
  feedbackError.value = ''
  try {
    await submitPublicEmailDraftFeedback(String(route.params.token), message)
    feedbackMessage.value = ''
    feedbackSent.value = true
  } catch { feedbackError.value = 'Feedback could not be sent. Please try again.' }
  finally { feedbackSending.value = false }
}

onMounted(() => {
  robotsMeta = document.querySelector('meta[name="robots"]')
  if (!robotsMeta) { robotsMeta = document.createElement('meta'); robotsMeta.name = 'robots'; document.head.append(robotsMeta) }
  else previousRobotsContent = robotsMeta.content
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
  <main class="shared-email-page">
    <header class="shared-email-topbar"><a class="shared-email-brand" href="/" aria-label="Shifd Marketing"><span class="shared-email-mark">S</span><span>Shifd Marketing</span></a><span class="shared-email-mode"><AppIcon name="eye" :size="15" /> View only</span></header>
    <div v-if="loading" class="shared-email-state"><span class="shared-email-spinner" /><strong>Loading shared email…</strong></div>
    <section v-else-if="unavailable || !email" class="shared-email-state"><span class="shared-email-unavailable-icon"><AppIcon name="link" :size="22" /></span><h1>This email link is unavailable</h1><p>The draft may have been archived. Ask the person who shared it for help.</p></section>
    <article v-else class="shared-email-card">
      <div class="shared-email-label"><AppIcon name="copy" :size="16" /> Shared email draft</div>
      <section class="shared-email-subject"><h1>{{ email.subject || '(No subject)' }}</h1></section>
      <section class="shared-email-body"><h2>Email body</h2><p>{{ email.body }}</p></section>
      <form class="shared-email-feedback" @submit.prevent="sendFeedback">
        <label for="email-feedback">Your feedback</label>
        <p>Share your comments or suggestions about this email.</p>
        <textarea id="email-feedback" v-model="feedbackMessage" rows="5" maxlength="5000" required placeholder="Write your feedback here…" :disabled="feedbackSending || feedbackSent" />
        <p v-if="feedbackError" class="shared-email-feedback-error" role="alert">{{ feedbackError }}</p>
        <p v-if="feedbackSent" class="shared-email-feedback-success" role="status">Thanks, your feedback has been sent.</p>
        <button type="submit" :disabled="feedbackSending || feedbackSent || !feedbackMessage.trim()">{{ feedbackSending ? 'Sending feedback…' : feedbackSent ? 'Feedback sent' : 'Send feedback' }}</button>
      </form>
      <footer><AppIcon name="eye" :size="15" /> This email is shared for review and cannot be edited here.</footer>
    </article>
  </main>
</template>

<style scoped>
.shared-email-page{min-height:100vh;background:#f6f8f7;color:#24342c;padding:0 24px 64px;font-family:Inter,system-ui,sans-serif}.shared-email-topbar{height:68px;max-width:1040px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4eae6}.shared-email-brand{display:flex;align-items:center;gap:10px;color:#294838;text-decoration:none;font-weight:700}.shared-email-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#245640;color:#fff}.shared-email-mode,.shared-email-card footer{display:flex;align-items:center;gap:7px;color:#68786f;font-size:13px}.shared-email-card{max-width:820px;margin:56px auto 0;border:1px solid #dfe7e2;border-radius:16px;background:#fff;box-shadow:0 8px 32px rgb(35 62 48 / 6%);overflow:hidden}.shared-email-label{display:flex;align-items:center;gap:8px;padding:18px 28px;background:#f9fbfa;border-bottom:1px solid #e7ece9;color:#577164;font-size:13px;font-weight:650}.shared-email-subject,.shared-email-body{padding:27px 32px}.shared-email-subject{border-bottom:1px solid #edf0ee}.shared-email-subject h1{font-size:25px;line-height:1.4;letter-spacing:-.02em;margin:0;color:#24352c;overflow-wrap:anywhere}.shared-email-body h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#78857e;margin:0 0 18px}.shared-email-body p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.75;margin:0;color:#34473d}.shared-email-feedback{display:grid;gap:10px;padding:26px 32px;border-top:1px solid #edf0ee;background:#fbfcfb}.shared-email-feedback label{font-size:17px;font-weight:700;color:#2c4437}.shared-email-feedback>p{margin:0;color:#728078;font-size:14px}.shared-email-feedback textarea{width:100%;resize:vertical;min-height:120px;padding:12px;border:1px solid #ccd8d0;border-radius:9px;font:inherit;line-height:1.5;color:#293b31;background:#fff}.shared-email-feedback textarea:focus{outline:2px solid #78a68a;outline-offset:1px}.shared-email-feedback button{justify-self:start;padding:10px 16px;border:0;border-radius:8px;background:#245640;color:#fff;font:inherit;font-weight:650;cursor:pointer}.shared-email-feedback button:disabled{opacity:.55;cursor:not-allowed}.shared-email-feedback .shared-email-feedback-error{color:#a13c36}.shared-email-feedback .shared-email-feedback-success{color:#21694d;font-weight:650}.shared-email-card footer{padding:16px 32px;border-top:1px solid #edf0ee;background:#fcfdfc}.shared-email-state{max-width:680px;margin:100px auto;text-align:center;display:grid;justify-items:center;gap:12px;color:#31443a}.shared-email-state h1{margin:0;font-size:24px}.shared-email-state p{color:#728078;margin:0;line-height:1.6}.shared-email-spinner{width:26px;height:26px;border:3px solid #dce7df;border-top-color:#377254;border-radius:50%;animation:spin .8s linear infinite}.shared-email-unavailable-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#eaf2ed;color:#356653}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:600px){.shared-email-page{padding:0 14px 40px}.shared-email-card{margin-top:28px}.shared-email-label{padding:15px 18px}.shared-email-subject,.shared-email-body{padding:22px 19px}.shared-email-subject h1{font-size:21px}.shared-email-body p{font-size:15px}.shared-email-feedback{padding:22px 19px}.shared-email-card footer{padding:14px 19px;align-items:flex-start}}
</style>
