import type { StepItem } from '../types/ui'

// These are presentation options shared by the locked Brief and Idea forms.
// Canonical context, idea, and content values are loaded from the backend.
export const briefSteps: StepItem[] = [
  { id: 'brief', label: 'Brief', description: 'Strategy Core' },
  { id: 'generate', label: 'Generate', description: 'Model Prompts', disabled: true },
  { id: 'adapt', label: 'Adapt', description: 'Multi-channel', disabled: true },
  { id: 'creative', label: 'Creative', description: 'Asset Studio', disabled: true },
  { id: 'review', label: 'Review', description: 'Quality & Brand', disabled: true },
  { id: 'schedule', label: 'Schedule', description: 'Deployment', disabled: true },
]

export const pillarOptions = [
  { value: 'educational', label: 'Educational', icon: 'idea' as const },
  { value: 'problem', label: 'Problem / Pain Point', icon: 'alert' as const },
  { value: 'product', label: 'Product Insight', icon: 'chart' as const },
  { value: 'use-case', label: 'Use Case', icon: 'check' as const },
  { value: 'industry', label: 'Industry Insight', icon: 'chart' as const },
  { value: 'thought-leadership', label: 'Thought Leadership', icon: 'system' as const },
  { value: 'company', label: 'Company / Brand', icon: 'company' as const },
]

export const objectiveOptions = [
  { value: 'awareness', label: 'Awareness', icon: 'overview' as const },
  { value: 'education', label: 'Education', icon: 'library' as const },
  { value: 'engagement', label: 'Engagement', icon: 'idea' as const },
  { value: 'credibility', label: 'Credibility', icon: 'check' as const },
  { value: 'consideration', label: 'Consideration', icon: 'arrow-right' as const },
  { value: 'discovery', label: 'Discovery', icon: 'search' as const },
]

export const audienceSuggestions = [
  'Corporate Administration',
  'Operations Teams',
  'Enterprise Organizations',
]

export const ideaContextOptions = [
  { value: 'company', label: 'Company' },
  { value: 'product', label: 'Product' },
]

export const ideaObjectiveOptions = objectiveOptions.map((option) => ({
  ...option,
  label: option.value === 'discovery' ? 'Product Discovery' : option.label,
}))
