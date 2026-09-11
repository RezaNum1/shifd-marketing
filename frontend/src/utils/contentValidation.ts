import type { ContentBrief } from '../types/content'

export function briefValidationErrors(brief: ContentBrief) {
  const errors: Partial<Record<keyof ContentBrief, string>> = {}
  if (!brief.context) errors.context = 'Choose a context.'
  if (brief.context === 'product' && !brief.product.trim()) errors.product = 'Choose a product.'
  if (!brief.pillar.trim()) errors.pillar = 'Choose a content pillar.'
  if (!brief.objective.trim()) errors.objective = 'Choose an objective.'
  if (!brief.audience.trim()) errors.audience = 'Enter a target audience.'
  if (!brief.topic.trim()) errors.topic = 'Enter a topic or idea.'
  return errors
}

export function isBriefReady(brief: ContentBrief) {
  return Object.keys(briefValidationErrors(brief)).length === 0
}
