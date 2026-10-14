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
  { value: 'educational', label: 'Educational', icon: 'idea' as const, description: 'Teach the audience a concept, process, or practical skill they can use.' },
  { value: 'problem', label: 'Problem / Pain Point', icon: 'alert' as const, description: 'Describe a specific challenge the audience faces and why it matters.' },
  { value: 'product', label: 'Product Insight', icon: 'chart' as const, description: 'Explain a product capability or benefit in the context of a real need.' },
  { value: 'use-case', label: 'Use Case', icon: 'check' as const, description: 'Show a concrete situation where a product, service, or idea can be applied.' },
  { value: 'industry', label: 'Industry Insight', icon: 'chart' as const, description: 'Share a relevant market pattern, change, or observation about the industry.' },
  { value: 'thought-leadership', label: 'Thought Leadership', icon: 'system' as const, description: 'Present a distinct point of view or informed perspective on an important topic.' },
  { value: 'company', label: 'Company / Brand', icon: 'company' as const, description: 'Communicate the company story, values, people, or point of difference.' },
]

export const objectiveOptions = [
  { value: 'awareness', label: 'Awareness', icon: 'overview' as const, description: 'Help people recognize the topic, company, or brand.' },
  { value: 'education', label: 'Education', icon: 'library' as const, description: 'Build understanding by explaining useful information or how something works.' },
  { value: 'engagement', label: 'Engagement', icon: 'idea' as const, description: 'Invite a response, discussion, or meaningful interaction from the audience.' },
  { value: 'credibility', label: 'Credibility', icon: 'check' as const, description: 'Build trust with expertise, evidence, or a clear explanation.' },
  { value: 'consideration', label: 'Consideration', icon: 'arrow-right' as const, description: 'Help the audience evaluate an approach or solution for their needs.' },
  { value: 'discovery', label: 'Discovery', icon: 'search' as const, description: 'Help people discover a relevant product, service, or new possibility.' },
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
