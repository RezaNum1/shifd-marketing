import type { StepItem } from '../types/ui'
import type {
  BrandAssessment,
  BrandAssessmentCheck,
  ContentBrief,
  MasterContent,
  InstagramVariant,
  LinkedInVariant,
  VisualDirection,
} from '../types/content'

export const contentBriefDefaults: ContentBrief = {
  context: 'product',
  product: 'shifd-approval',
  pillar: 'educational',
  objective: 'awareness',
  audience: 'Corporate Administration / Enterprise',
  topic: 'Digital Approval vs Traditional Paper Approval',
  thesis:
    'Explain how a structured digital approval workflow can make correspondence and ownership easier to follow than manual paper handoffs.',
  constraints:
    'Keep the tone professional, practical, and clear. Avoid unsupported numerical or performance claims.',
}

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

export const generatedContentVariants: MasterContent[] = [
  {
    id: 'workflow-delay',
    label: 'Draft 01',
    title: 'Why Manual Approval Slows Organizations',
    coreMessage:
      'Approval work moves faster when requests, decisions, and follow-up actions stay in one clear digital workflow.',
    hook: 'A document should not spend days waiting for its next approver.',
    body:
      'Manual approval often means a request moves between inboxes, desks, and spreadsheets before anyone can see its current status. That makes ownership harder to follow and creates extra work for administration and operations teams. Shifd Approval gives organizations a clearer way to route correspondence, capture decisions, and keep approval work moving in one place.',
    cta: 'See how Shifd Approval can simplify your approval workflow.',
  },
  {
    id: 'paper-handoffs',
    label: 'Draft 02',
    title: 'Approval Work Should Not Wait on Paper',
    coreMessage:
      'A dependable approval process gives every request a clear owner, next step, and record of the decision.',
    hook: 'When approval depends on a paper handoff, progress is easy to lose sight of.',
    body:
      'Teams need a practical way to move correspondence from request to decision without relying on manual check-ins. Shifd Approval brings the workflow into a shared digital space so administration and enterprise teams can see what needs attention, coordinate the next step, and keep a usable record of each approval.',
    cta: 'Explore a clearer way to manage organizational approvals.',
  },
]

export const visualDirectionMock: VisualDirection = {
  format: 'Carousel',
  concept:
    'Compare a traditional paper-based approval process with a digital approval workflow.',
  structure: [
    'Hook',
    'The operational problem',
    'Traditional approval process',
    'Digital approval workflow',
    'CTA',
  ],
  notes:
    'Use a clean enterprise visual style with document and workflow imagery. Avoid unsupported numerical claims.',
}

export const instagramAdaptationVariants: InstagramVariant[] = [
  {
    caption:
      'Approval should move work forward, not keep it waiting.\n\nSee how a clear digital workflow helps teams keep correspondence, owners, and next steps together.\n\nSwipe through the difference between paper handoffs and digital approval with Shifd Approval.',
    cta: 'Explore Shifd Approval',
    hashtags: '#DigitalTransformation #WorkflowAutomation #EnterpriseSoftware',
    visualRecommendation:
      'Five-slide carousel with a clean split between paper approval handoffs and a digital workflow. Use calm navy, white, and blue accents.',
  },
  {
    caption:
      'A paper handoff can make a simple approval feel harder to follow.\n\nShifd Approval gives administration and operations teams one place to route correspondence, clarify ownership, and keep decisions moving.\n\nSwipe for a simpler approval workflow.',
    cta: 'See the workflow in action',
    hashtags: '#DigitalWorkplace #ProcessImprovement #ShifdApproval',
    visualRecommendation:
      'Carousel that starts with a single paper document, then progressively reveals a clear digital approval path and shared status view.',
  },
]

export const linkedInAdaptationVariants: LinkedInVariant[] = [
  {
    postCopy:
      'Manual approval processes create friction long before a decision is made. Requests move through inboxes, desks, and spreadsheets, while teams work to understand ownership and the next step.\n\nFor corporate administration and enterprise operations teams, a dependable workflow makes the process easier to follow. Shifd Approval brings correspondence, routing, and decisions into one digital space so organizations can keep approval work moving with greater clarity.\n\nThe goal is simple: make the path from request to decision easier for the people responsible for it.',
    cta: 'Learn how Shifd Approval supports clearer organizational workflows.',
    hashtags: '#DigitalTransformation #EnterpriseOperations #WorkflowAutomation',
    visualRecommendation:
      'Use a professional single-image or carousel layout with a process diagram: request, review, decision, and follow-up. Keep the visual restrained and easy to scan.',
  },
  {
    postCopy:
      'The way an organization handles approvals says a lot about how clearly work moves through it.\n\nWhen correspondence depends on manual handoffs, teams spend time checking where a request is and who owns the next action. A digital approval workflow gives administration and enterprise teams a shared view of that path.\n\nShifd Approval is designed to help organizations make approval work more visible, structured, and practical for the people managing it every day.',
    cta: 'Explore a more structured approval process with Shifd Approval.',
    hashtags: '#OperationalClarity #BusinessWorkflow #EnterpriseSoftware',
    visualRecommendation:
      'Thought-leadership card with a clear workflow line and supporting document imagery. Favor whitespace, strong hierarchy, and a calm enterprise palette.',
  },
]

const standardAssessmentChecks: BrandAssessmentCheck[] = [
  { label: 'Brand Tone', status: 'pass' },
  { label: 'Audience Alignment', status: 'pass' },
  { label: 'Message Accuracy', status: 'pass' },
  { label: 'Context Alignment', status: 'pass' },
  { label: 'CTA Alignment', status: 'warning' },
]

export const brandAssessmentMocks: Record<
  'instagram' | 'linkedin',
  BrandAssessment
> = {
  instagram: {
    score: 92,
    status: 'Aligned',
    recommendation: 'Use a softer discovery-oriented CTA.',
    checks: standardAssessmentChecks.map((check) => ({ ...check })),
    state: 'assessed',
  },
  linkedin: {
    score: 84,
    status: 'Needs Attention',
    recommendation: 'Reduce promotional phrasing and use a more professional closing.',
    checks: standardAssessmentChecks.map((check) => ({ ...check })),
    state: 'assessed',
  },
}
