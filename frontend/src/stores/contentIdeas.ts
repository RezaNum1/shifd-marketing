import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as ideasApi from '../api/ideas'
import { errorMessage, isApiError } from '../api/client'
import { beginCommand, completeCommand, discardCommand } from '../api/idempotency'
import { idea as normalizeIdea } from '../api/normalizers'
import type { ContentIdea, ContentIdeaInput } from '../types/contentIdea'

// Keep these codes aligned with the backend taxonomy. Labels remain a UI
// concern in the locked Idea/Brief forms.
const PILLARS = ['educational', 'problem', 'product', 'use-case', 'industry', 'thought-leadership', 'company']
const OBJECTIVES = ['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery']

export function validateIdea(input: ContentIdeaInput): Partial<Record<keyof ContentIdeaInput, string>> {
  const errors: Partial<Record<keyof ContentIdeaInput, string>> = {}
  if (!input.title.trim()) errors.title = 'Enter an idea title.'
  if (!['company', 'product'].includes(input.contextType)) errors.contextType = 'Choose a context.'
  if (input.contextType === 'product' && !input.productId?.trim()) errors.productId = 'Choose a product.'
  if (!PILLARS.includes(input.pillar)) errors.pillar = 'Choose a content pillar.'
  if (!OBJECTIVES.includes(input.objective)) errors.objective = 'Choose an objective.'
  return errors
}

function cleanInput(input: ContentIdeaInput): ideasApi.IdeaInput {
  return {
    title: input.title.trim(),
    contextType: input.contextType,
    productId: input.contextType === 'product' ? input.productId : null,
    pillarCode: input.pillar,
    objective: input.objective,
    targetAudience: input.targetAudience?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export const useContentIdeasStore = defineStore('contentIdeas', () => {
  const ideas = ref<ContentIdea[]>([])
  const etags = ref<Record<string, string>>({})
  const versions = ref<Record<string, number>>({})
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const recentReadyIdeas = computed(() => ideas.value.filter((item) => item.status === 'Ready').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const result = await ideasApi.listIdeas()
      ideas.value = result.data.map(normalizeIdea)
      ideas.value.forEach((item) => {
        if (item.version !== undefined) {
          versions.value[item.id] = item.version
          etags.value[item.id] = `"${item.version}"`
        }
      })
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load ideas.')
    } finally { loading.value = false }
  }

  async function save(input: ContentIdeaInput, id?: string) {
    if (Object.keys(validateIdea(input)).length) return undefined
    error.value = ''
    let commandIdentity: string | undefined
    try {
      if (id) {
        const source = ideas.value.find((item) => item.id === id)
        const etag = source && (etags.value[id] ?? versions.value[id])
        if (!source || source.status !== 'Ready' || etag === undefined) return undefined
        const result = await ideasApi.updateIdea(id, cleanInput(input), etag)
        const value = normalizeIdea(result.data)
        upsert(value, result.etag)
        return value
      }
      const cleaned = cleanInput(input)
      const command = beginCommand('idea.create', JSON.stringify(cleaned))
      commandIdentity = command.identity
      const result = await ideasApi.createIdea(cleaned, command.key)
      completeCommand(command.identity)
      const value = normalizeIdea(result.data)
      upsert(value, result.etag)
      return value
    } catch (reason: unknown) {
      if (commandIdentity && isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(commandIdentity)
      error.value = errorMessage(reason, 'Unable to save the idea.')
      if (error.value.includes('changed elsewhere') && id) await load(true)
      return undefined
    }
  }

  async function duplicate(id: string) {
    const etag = etags.value[id] ?? versions.value[id]
    if (etag === undefined) return undefined
    const command = beginCommand(`idea.duplicate:${id}`, String(etag))
    return mutateIdea(() => ideasApi.duplicateIdea(id, etag, command.key), 'Unable to duplicate the idea.', command.identity)
  }

  async function archive(id: string) {
    const etag = etags.value[id] ?? versions.value[id]
    if (etag === undefined) return false
    return Boolean(await mutateIdea(() => ideasApi.archiveIdea(id, etag), 'Unable to archive the idea.'))
  }

  async function restore(id: string) {
    const etag = etags.value[id] ?? versions.value[id]
    if (etag === undefined) return false
    return Boolean(await mutateIdea(() => ideasApi.restoreIdea(id, etag), 'Unable to restore the idea.'))
  }

  // Idea usage is committed by the backend transaction that creates Content.
  // This compatibility method intentionally does not mutate canonical state.
  function markUsed(_id: string) { return false }
  function linkContent(_id: string, _contentId: string) { return false }

  function upsert(value: ContentIdea, etag?: string | null) {
    const index = ideas.value.findIndex((item) => item.id === value.id)
    if (index < 0) ideas.value.unshift(value)
    else ideas.value[index] = value
    if (value.version !== undefined) versions.value[value.id] = value.version
    if (etag) etags.value[value.id] = etag
  }

  async function mutateIdea(call: () => ReturnType<typeof ideasApi.duplicateIdea>, fallback: string, commandIdentity?: string) {
    try {
      const result = await call()
      if (commandIdentity) completeCommand(commandIdentity)
      const value = normalizeIdea(result.data)
      upsert(value, result.etag)
      return value
    } catch (reason: unknown) {
      if (commandIdentity && isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(commandIdentity)
      error.value = errorMessage(reason, fallback)
      if (error.value.includes('changed elsewhere')) await load(true)
      return undefined
    }
  }

  return { ideas, etags, versions, loading, loaded, error, recentReadyIdeas, load, save, duplicate, archive, restore, markUsed, linkContent }
})
