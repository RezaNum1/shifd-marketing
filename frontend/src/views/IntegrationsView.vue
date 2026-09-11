<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useIntegrationsStore } from '../stores/integrations'
import type { Tone } from '../types/ui'

const router = useRouter()
const integrations = useIntegrationsStore()
const disconnectOpen = ref(false)

function instagramTone(): Tone { return integrations.instagram.status === 'connected' ? 'success' : 'neutral' }
function instagramStatus() { return integrations.instagram.status === 'connected' ? 'Connected' : 'Not Connected' }
</script>

<template>
  <div class="page-stack integrations-page">
    <PageHeader title="Integrations" description="Manage the external data sources used by Shifd Marketing." :breadcrumbs="[{ label: 'System' }, { label: 'Integrations' }]" />

    <section class="integration-note"><AppIcon name="info" :size="17" /><span>These settings describe prototype data sources. No credentials are stored and no social platform is published to automatically.</span></section>

    <section class="integration-grid" aria-label="Data source integrations">
      <BaseCard class="integration-card">
        <template #header><div class="integration-card__header"><div class="integration-card__identity"><span class="integration-card__icon is-instagram"><AppIcon name="chart" :size="20" /></span><div><h2 class="text-headline-sm font-semibold">Instagram</h2><p class="text-body-sm text-muted">Performance metrics synchronization</p></div></div><StatusBadge :tone="instagramTone()" dot>{{ instagramStatus() }}</StatusBadge></div></template>
        <div class="integration-card__body">
          <dl class="integration-details">
            <div><dt>Account</dt><dd>{{ integrations.instagram.accountName || '—' }}</dd></div>
            <div><dt>Data Usage</dt><dd>Performance metrics</dd></div>
            <div><dt>Future Data Source</dt><dd>{{ integrations.instagram.futureSource }}</dd></div>
            <div><dt>Last Sync</dt><dd>{{ integrations.instagram.lastSync || 'Never' }}</dd></div>
          </dl>
          <p v-if="integrations.instagramSyncState === 'success'" class="integration-feedback is-success" role="status"><AppIcon name="check" :size="15" />Synced successfully</p>
          <p v-else-if="integrations.instagramSyncState === 'syncing'" class="integration-feedback" role="status"><span class="ui-spinner" aria-hidden="true" />Syncing…</p>
          <div class="integration-actions">
            <BaseButton v-if="integrations.instagram.status === 'connected'" variant="secondary" :disabled="integrations.instagramSyncState === 'syncing'" @click="integrations.syncInstagram"><AppIcon name="chart" :size="16" />{{ integrations.instagramSyncState === 'syncing' ? 'Syncing…' : 'Sync Now' }}</BaseButton>
            <BaseButton v-if="integrations.instagram.status === 'connected'" variant="ghost" @click="disconnectOpen = true">Disconnect</BaseButton>
            <BaseButton v-else @click="integrations.connectInstagram">Connect Instagram</BaseButton>
          </div>
        </div>
      </BaseCard>

      <BaseCard class="integration-card">
        <template #header><div class="integration-card__header"><div class="integration-card__identity"><span class="integration-card__icon is-linkedin"><AppIcon name="library" :size="20" /></span><div><h2 class="text-headline-sm font-semibold">LinkedIn</h2><p class="text-body-sm text-muted">Manual performance data</p></div></div><StatusBadge tone="info" dot>Manual Entry</StatusBadge></div></template>
        <div class="integration-card__body"><dl class="integration-details"><div><dt>Data Source</dt><dd>Manual Entry</dd></div><div><dt>Data Used</dt><dd>Followers, reach, impressions, engagements, published posts</dd></div><div><dt>Purpose</dt><dd>Weekly LinkedIn performance tracking</dd></div></dl><div class="integration-actions"><BaseButton variant="secondary" @click="router.push('/performance/linkedin')">Manage LinkedIn Metrics <AppIcon name="arrow-right" :size="15" /></BaseButton></div></div>
      </BaseCard>

      <BaseCard class="integration-card">
        <template #header><div class="integration-card__header"><div class="integration-card__identity"><span class="integration-card__icon is-whatsapp"><AppIcon name="idea" :size="20" /></span><div><h2 class="text-headline-sm font-semibold">WhatsApp Business</h2><p class="text-body-sm text-muted">Supplementary inbound inquiry tracking</p></div></div><StatusBadge tone="info" dot>Manual Entry</StatusBadge></div></template>
        <div class="integration-card__body"><dl class="integration-details"><div><dt>Data Source</dt><dd>Manual Entry</dd></div><div><dt>Data Used</dt><dd>Weekly inquiry counts</dd></div><div><dt>Purpose</dt><dd>Supplementary research metric only</dd></div></dl><p class="integration-helper">This does not connect to messages or a WhatsApp inbox. Inquiry counts remain separate from social-media KPIs.</p></div>
      </BaseCard>
    </section>

    <BaseCard title="Data Source Summary" description="The current prototype keeps source configuration explicit and lightweight."><div class="source-summary"><div><span class="source-summary__dot is-connected" /><div><strong>Instagram</strong><small>Future automated metrics sync · current values are mock data</small></div></div><div><span class="source-summary__dot is-manual" /><div><strong>LinkedIn</strong><small>Manual weekly metrics entry</small></div></div><div><span class="source-summary__dot is-manual" /><div><strong>WhatsApp Business</strong><small>Manual supplementary inquiry tracking</small></div></div></div></BaseCard>

    <BaseModal v-model="disconnectOpen" title="Disconnect Instagram?" description="Performance data already recorded in Shifd Marketing will remain available. Future synchronization will stop."><template #footer><BaseButton variant="ghost" @click="disconnectOpen = false">Cancel</BaseButton><BaseButton variant="danger" @click="integrations.disconnectInstagram(); disconnectOpen = false">Disconnect</BaseButton></template></BaseModal>
  </div>
</template>

<style scoped>
.integrations-page { max-width: 1100px; }
.integration-note { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-well); color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.integration-note .app-icon { flex: 0 0 auto; color: var(--color-primary); }
.integration-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.integration-card { min-width: 0; }
.integration-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; width: 100%; }
.integration-card__identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.integration-card__identity p { margin-top: 3px; }
.integration-card__icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 10px; background: var(--color-well); color: var(--color-primary); }
.integration-card__icon.is-instagram { color: #7c3aed; }
.integration-card__icon.is-linkedin { color: #2563eb; }
.integration-card__icon.is-whatsapp { color: #047857; }
.integration-card__body { display: grid; gap: 16px; }
.integration-details { display: grid; gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.integration-details div { display: grid; grid-template-columns: minmax(110px, .7fr) minmax(0, 1.3fr); gap: 12px; padding: 11px 12px; background: var(--color-surface); font-size: 12px; line-height: 1.4; }
.integration-details dt { color: var(--color-subtle); }
.integration-details dd { margin: 0; color: var(--color-ink); font-weight: 500; overflow-wrap: anywhere; }
.integration-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.integration-feedback { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--color-primary); font-size: 12px; }
.integration-feedback.is-success { color: var(--color-success); }
.integration-feedback .ui-spinner { width: 14px; height: 14px; border-width: 2px; }
.integration-helper { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.source-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.source-summary > div { display: flex; align-items: flex-start; gap: 10px; padding: 14px; background: var(--color-surface); }
.source-summary__dot { width: 8px; height: 8px; flex: 0 0 auto; margin-top: 5px; border-radius: 50%; }
.source-summary__dot.is-connected { background: var(--color-success); }
.source-summary__dot.is-manual { background: var(--color-primary); }
.source-summary strong, .source-summary small { display: block; }
.source-summary small { margin-top: 4px; color: var(--color-muted); font-size: 11px; line-height: 1.4; }
@media (max-width: 760px) { .integration-grid, .source-summary { grid-template-columns: 1fr; } }
</style>
