import type { SelectOption, StepItem } from '../types/ui'

export interface ContentBriefMock {
  context: 'company' | 'product'
  product: string
  pillar: string
  objective: string
  audience: string
  topic: string
  thesis: string
  constraints: string
}

export const contentBriefDefaults: ContentBriefMock = {
  context: 'product',
  product: 'shifd-approval',
  pillar: 'educational',
  objective: 'awareness',
  audience: 'IT Directors, Government Bureau Chiefs, & Enterprise Operations Leads',
  topic: 'Digital Approval vs Traditional Paper Approval',
  thesis:
    'Highlight the time cost, document loss risk, and audit vulnerabilities of physical signature runs compared with automated digital audit trails.',
  constraints:
    'Keep tone authoritative, respectful of civil servants, pragmatic. Avoid buzzwords like synergy or disruptive.',
}

export const briefSteps: StepItem[] = [
  { id: 'brief', label: 'Brief', description: 'Strategy Core' },
  { id: 'generate', label: 'Generate', description: 'Model Prompts', disabled: true },
  { id: 'adapt', label: 'Adapt', description: 'Multi-channel', disabled: true },
  { id: 'creative', label: 'Creative', description: 'Asset Studio', disabled: true },
  { id: 'review', label: 'Review', description: 'Quality & Brand', disabled: true },
  { id: 'schedule', label: 'Schedule', description: 'Deployment', disabled: true },
]

export const productOptions: SelectOption[] = [
  { value: 'shifd-approval', label: 'Shifd Approval — Digital correspondence and approval workflow' },
  { value: 'shifd-vault', label: 'Shifd Vault — Sovereign enterprise document repository' },
  { value: 'shifd-sign', label: 'Shifd Sign — E-signature and cryptographic audit log' },
  { value: 'shifd-identity', label: 'Shifd Identity — PKI infrastructure & civil identity' },
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
  'Ministry Department Heads',
  'Compliance Auditors',
  'Chief Digital Officers',
]
