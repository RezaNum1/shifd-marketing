import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mockContentIdeas, ideaObjectiveOptions } from '../data/contentIdeas'
import { pillarOptions } from '../data/contentBrief'
import type { ContentIdea, ContentIdeaInput } from '../types/contentIdea'

export function validateIdea(input: ContentIdeaInput): Partial<Record<keyof ContentIdeaInput, string>> {
  const errors: Partial<Record<keyof ContentIdeaInput, string>> = {}
  if (!input.title.trim()) errors.title = 'Enter an idea title.'
  if (!['company', 'product'].includes(input.contextType)) errors.contextType = 'Choose a context.'
  if (input.contextType === 'product' && !input.productId?.trim()) errors.productId = 'Choose a product.'
  if (!pillarOptions.some((option) => option.value === input.pillar)) errors.pillar = 'Choose a content pillar.'
  if (!ideaObjectiveOptions.some((option) => option.value === input.objective)) errors.objective = 'Choose an objective.'
  return errors
}

function cleanInput(input: ContentIdeaInput): ContentIdeaInput {
  return {
    title: input.title.trim(), contextType: input.contextType,
    productId: input.contextType === 'product' ? input.productId : undefined,
    pillar: input.pillar, objective: input.objective,
    targetAudience: input.targetAudience?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  }
}

export const useContentIdeasStore = defineStore('contentIdeas', () => {
  const ideas = ref<ContentIdea[]>(mockContentIdeas.map((idea) => ({ ...idea })))
  const recentReadyIdeas = computed(() => ideas.value.filter((idea) => idea.status === 'Ready')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))

  function save(input: ContentIdeaInput, id?: string) {
    if (Object.keys(validateIdea(input)).length) return
    const now = new Date().toISOString()
    if (id) {
      const idea = ideas.value.find((item) => item.id === id)
      if (!idea || idea.status !== 'Ready') return
      Object.assign(idea, cleanInput(input), { updatedAt: now })
      return idea
    }
    const idea: ContentIdea = { ...cleanInput(input), id: `idea-${crypto.randomUUID()}`, status: 'Ready', createdAt: now, updatedAt: now }
    ideas.value.unshift(idea)
    return idea
  }

  function duplicate(id: string) {
    const source = ideas.value.find((idea) => idea.id === id)
    if (source) return save({ ...source, title: `${source.title} — Copy` })
  }

  function archive(id: string) {
    const idea = ideas.value.find((item) => item.id === id)
    if (idea && idea.status !== 'Archived') Object.assign(idea, { status: 'Archived', updatedAt: new Date().toISOString() })
  }

  function restore(id: string) {
    const idea = ideas.value.find((item) => item.id === id)
    if (idea?.status === 'Archived') Object.assign(idea, { status: 'Ready', updatedAt: new Date().toISOString() })
  }

  function markUsed(id: string) {
    const idea = ideas.value.find((item) => item.id === id)
    if (idea?.status === 'Ready') Object.assign(idea, { status: 'Used', updatedAt: new Date().toISOString() })
  }

  function linkContent(id: string, contentId: string) {
    const idea = ideas.value.find((item) => item.id === id)
    if (idea) idea.relatedContentId = contentId
  }

  return { ideas, recentReadyIdeas, save, duplicate, archive, restore, markUsed, linkContent }
})
