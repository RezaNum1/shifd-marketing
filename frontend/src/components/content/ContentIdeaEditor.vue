<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseTextarea from '../ui/BaseTextarea.vue'
import { ideaContextOptions, ideaObjectiveOptions, pillarOptions } from '../../constants/contentOptions'
import { useProductsStore } from '../../stores/products'
import { useContentIdeasStore, validateIdea } from '../../stores/contentIdeas'
import type { ContentIdea, ContentIdeaInput } from '../../types/contentIdea'

const props = defineProps<{ idea?: ContentIdea }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [idea: ContentIdea] }>()
const store = useContentIdeasStore()
const products = useProductsStore()
const productOptions = computed(() => products.productOptions.map((option) => ({ ...option, label: option.label })))
const formElement = ref<HTMLFormElement>()
const attempted = ref(false)
const form = reactive<ContentIdeaInput>({ title: '', contextType: 'product', productId: '', pillar: '', objective: '', targetAudience: '', notes: '' })
const errors = computed(() => attempted.value ? validateIdea(form) : {})

watch(open, (value) => {
  if (!value) return
  attempted.value = false
  Object.assign(form, {
    title: props.idea?.title ?? '', contextType: props.idea?.contextType ?? 'product',
    productId: props.idea?.productId ?? '', pillar: props.idea?.pillar ?? '',
    objective: props.idea?.objective ?? '', targetAudience: props.idea?.targetAudience ?? '', notes: props.idea?.notes ?? '',
  })
})

async function save() {
  attempted.value = true
  if (Object.keys(errors.value).length) {
    await nextTick()
    formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  const idea = await store.save(form, props.idea?.id)
  if (idea) { open.value = false; emit('saved', idea) }
}
</script>

<template>
  <BaseModal v-model="open" :title="idea ? 'Edit Idea' : 'Add Idea'" description="Capture a topic for a future content brief. Required fields are marked with an asterisk.">
    <form id="content-idea-form" ref="formElement" class="idea-form" novalidate @submit.prevent="save">
      <BaseInput v-model="form.title" label="Title" required :error="errors.title" />
      <BaseSelect v-model="form.contextType" label="Context Type" :options="ideaContextOptions" required :error="errors.contextType" />
      <BaseSelect v-if="form.contextType === 'product'" v-model="form.productId" label="Product" placeholder="Select a product" :options="productOptions" required :error="errors.productId" />
      <BaseSelect v-model="form.pillar" label="Content Pillar" placeholder="Select a pillar" :options="pillarOptions" required :error="errors.pillar" />
      <BaseSelect v-model="form.objective" label="Objective" placeholder="Select an objective" :options="ideaObjectiveOptions" required :error="errors.objective" />
      <BaseInput v-model="form.targetAudience" label="Target Audience" />
      <BaseTextarea v-model="form.notes" label="Notes" :rows="3" hint="These notes will become Additional Instructions in the Brief." />
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancel</BaseButton>
      <BaseButton type="submit" form="content-idea-form">Save Idea</BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.idea-form { display: grid; gap: 16px; }
</style>
