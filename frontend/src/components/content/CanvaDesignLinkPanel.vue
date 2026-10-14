<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseCard from '../ui/BaseCard.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseModal from '../ui/BaseModal.vue'
import InlineAlert from '../ui/InlineAlert.vue'
import { errorMessage } from '../../api/client'
import * as contentApi from '../../api/content'
import type { BackendCanvaDesignLink } from '../../types/backend'

const props = defineProps<{
  contentId: string
  link: BackendCanvaDesignLink | null
  editable?: boolean
}>()
const emit = defineEmits<{ updated: [link: BackendCanvaDesignLink | null] }>()
const savedLink = ref<BackendCanvaDesignLink | null>(props.link)
const url = ref(props.link?.url ?? '')
const editing = ref(!props.link?.url)
const saving = ref(false)
const removing = ref(false)
const removeOpen = ref(false)
const error = ref('')

watch(() => props.link, (value) => {
  savedLink.value = value
  url.value = value?.url ?? ''
  editing.value = !value?.url
})

function editLink() {
  url.value = savedLink.value?.url ?? ''
  error.value = ''
  editing.value = true
}

function cancelEdit() {
  url.value = savedLink.value?.url ?? ''
  error.value = ''
  editing.value = !savedLink.value?.url
}

async function saveLink() {
  if (saving.value || !props.contentId) return
  saving.value = true
  error.value = ''
  try {
    const result = await contentApi.saveCanvaDesignLink(props.contentId, url.value.trim())
    savedLink.value = result.data
    url.value = result.data.url ?? ''
    editing.value = false
    emit('updated', result.data)
  } catch (reason: unknown) {
    error.value = errorMessage(reason, 'The Canva design link could not be saved.')
  } finally {
    saving.value = false
  }
}

async function removeLink() {
  if (removing.value || !props.contentId) return
  removing.value = true
  error.value = ''
  try {
    const result = await contentApi.removeCanvaDesignLink(props.contentId)
    savedLink.value = result.data
    url.value = ''
    editing.value = true
    removeOpen.value = false
    emit('updated', result.data)
  } catch (reason: unknown) {
    error.value = errorMessage(reason, 'The Canva design link could not be removed.')
  } finally {
    removing.value = false
  }
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
</script>

<template>
  <BaseCard title="Design Workspace" description="Keep the external Canva design link with this Content. The final creative still needs to be uploaded below.">
    <div v-if="savedLink?.url && !editing" class="canva-link-saved">
      <div class="canva-link-saved__main">
        <span class="canva-link-saved__label">Canva Design</span>
        <a :href="savedLink.url" target="_blank" rel="noopener noreferrer">Open in Canva <span aria-hidden="true">↗</span></a>
        <small>Updated {{ formatUpdatedAt(savedLink.updatedAt) }} by {{ savedLink.updatedBy.name }}</small>
      </div>
      <div v-if="editable" class="canva-link-saved__actions">
        <BaseButton variant="secondary" size="compact" @click="editLink">Edit</BaseButton>
        <BaseButton variant="ghost" size="compact" class="canva-link-remove" @click="removeOpen = true">Remove</BaseButton>
      </div>
    </div>
    <form v-else-if="editable" class="canva-link-form" @submit.prevent="saveLink">
      <BaseInput v-model="url" label="Canva Design Link (optional)" type="url" maxlength="2048" placeholder="https://www.canva.com/design/..." />
      <InlineAlert v-if="error" title="Canva design link" tone="warning">{{ error }}</InlineAlert>
      <div class="canva-link-form__actions">
        <BaseButton v-if="savedLink?.url" variant="ghost" type="button" @click="cancelEdit">Cancel</BaseButton>
        <BaseButton type="submit" :loading="saving" :disabled="saving || !url.trim()">{{ savedLink?.url ? 'Save link' : 'Save Canva Link' }}</BaseButton>
      </div>
    </form>
    <p v-else class="detail-helper">No Canva design link has been saved.</p>

    <BaseModal v-model="removeOpen" title="Remove Canva design link" description="This removes the saved external design reference. Uploaded creative assets are not affected.">
      <p>Remove the Canva design link from this Content?</p>
      <InlineAlert v-if="error" title="Canva design link" tone="warning">{{ error }}</InlineAlert>
      <template #footer>
        <BaseButton variant="ghost" :disabled="removing" @click="removeOpen = false">Cancel</BaseButton>
        <BaseButton variant="danger" :loading="removing" :disabled="removing" @click="removeLink">Remove link</BaseButton>
      </template>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
.canva-link-saved { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.canva-link-saved__main { display: grid; gap: 5px; min-width: 0; }
.canva-link-saved__label { color: var(--color-muted); font-size: 12px; font-weight: 600; }
.canva-link-saved__main a { width: fit-content; color: var(--color-accent); font-size: 15px; font-weight: 650; text-decoration: none; }
.canva-link-saved__main a:hover { text-decoration: underline; }
.canva-link-saved__main small { color: var(--color-muted); font-size: 12px; }
.canva-link-saved__actions, .canva-link-form__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.canva-link-form { display: grid; gap: 14px; }
.canva-link-remove { color: var(--color-danger) !important; }
@media (max-width: 520px) { .canva-link-saved { align-items: flex-start; flex-direction: column; } .canva-link-saved__actions { justify-content: flex-start; } }
</style>
