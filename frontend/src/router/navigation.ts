import type { NavigationGroup, PageDefinition } from '../types/navigation'

export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Platform',
    items: [{ key: 'overview', label: 'Overview', to: '/', icon: 'overview' }],
  },
  {
    label: 'Content Studio',
    items: [
      { key: 'ideas', label: 'Ideas', to: '/content/ideas', icon: 'idea' },
      {
        key: 'content',
        label: 'Content Library',
        to: '/content',
        icon: 'library',
      },
    ],
  },
  { label: 'Prospect Management', items: [{ key: 'prospects', label: 'Prospects', to: '/prospects', icon: 'company' }] },
  {
    label: 'Planning',
    items: [{ key: 'calendar', label: 'Calendar', to: '/calendar', icon: 'calendar' }],
  },
  {
    label: 'Performance',
    items: [
      {
        key: 'performance',
        label: 'Overview',
        to: '/performance',
        icon: 'chart',
      },
      {
        key: 'performance-evaluation',
        label: 'Evaluation',
        to: '/performance/evaluation',
        icon: 'check',
      },
      {
        key: 'performance-linkedin',
        label: 'LinkedIn Metrics',
        to: '/performance/linkedin',
        icon: 'linkedin',
      },
    ],
  },
  {
    label: 'Context Engine',
    items: [
      {
        key: 'company',
        label: 'Company',
        to: '/context/company',
        icon: 'company',
      },
      {
        key: 'products',
        label: 'Products',
        to: '/context/products',
        icon: 'product',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        key: 'integrations',
        label: 'Integrations',
        to: '/settings/integrations',
        icon: 'integrations',
      },
      { key: 'ai', label: 'AI & System', to: '/settings/ai', icon: 'system' },
    ],
  },
]

export const pages: PageDefinition[] = [
  { path: '/prospects', name: 'prospects', title: 'Prospects', description: 'Manage target organizations and import prospect lists.', icon: 'company', navigationKey: 'prospects', group: 'Prospect Management' },
  { path: '/prospects/:id', name: 'prospect-detail', title: 'Prospect Details', description: 'Review and update prospect organization information.', icon: 'company', navigationKey: 'prospects', group: 'Prospect Management', parent: { label: 'Prospects', to: '/prospects' } },
  {
    path: '/',
    name: 'overview',
    title: 'Overview',
    description: 'Your marketing execution at a glance.',
    icon: 'overview',
    navigationKey: 'overview',
    group: 'Platform',
  },
  {
    path: '/content/ideas',
    name: 'ideas',
    title: 'Content Ideas',
    description:
      'Capture ideas before turning them into focused marketing briefs.',
    icon: 'idea',
    navigationKey: 'ideas',
    group: 'Content Studio',
  },
  {
    path: '/content/create',
    name: 'create-content',
    title: 'Create Content',
    description:
      'Turn your company and product context into thoughtful marketing content.',
    icon: 'sparkles',
    navigationKey: 'create',
    group: 'Content Studio',
  },
  {
    path: '/content',
    name: 'content-library',
    title: 'Content Library',
    description:
      'A shared home for your marketing content and creative assets.',
    icon: 'library',
    navigationKey: 'content',
    group: 'Content Studio',
  },
  {
    path: '/content/library',
    name: 'content-library-alias',
    title: 'Content Library',
    description:
      'A shared home for your marketing content and creative assets.',
    icon: 'library',
    navigationKey: 'content',
    group: 'Content Studio',
  },
  {
    path: '/content/:id',
    name: 'content-detail',
    title: 'Content Detail',
    description:
      'Review content, platform variations, creative assets, and activity.',
    icon: 'library',
    navigationKey: 'content',
    group: 'Content Studio',
    parent: { label: 'Content Library', to: '/content' },
  },
  {
    path: '/calendar',
    name: 'calendar',
    title: 'Content Calendar',
    description:
      'Plan your publishing rhythm and keep upcoming content in view.',
    icon: 'calendar',
    navigationKey: 'calendar',
    group: 'Planning',
  },
  {
    path: '/performance',
    name: 'performance',
    title: 'Performance',
    description:
      'Track content execution and social media performance over time.',
    icon: 'chart',
    navigationKey: 'performance',
    group: 'Performance',
  },
  {
    path: '/performance/evaluation',
    name: 'performance-evaluation',
    title: 'Evaluation',
    description: 'Configure the research period and review its supporting observations.',
    icon: 'check',
    navigationKey: 'performance-evaluation',
    group: 'Performance',
    parent: { label: 'Performance', to: '/performance' },
  },
  {
    path: '/performance/linkedin',
    name: 'performance-linkedin',
    title: 'LinkedIn Metrics',
    description: 'Record LinkedIn performance metrics manually.',
    icon: 'linkedin',
    navigationKey: 'performance-linkedin',
    group: 'Performance',
    parent: { label: 'Performance', to: '/performance' },
  },
  {
    path: '/context/company',
    name: 'company',
    title: 'Company Context',
    description: 'Build the strategic foundation behind your marketing.',
    icon: 'company',
    navigationKey: 'company',
    group: 'Context Engine',
  },
  {
    path: '/context/products',
    name: 'products',
    title: 'Products',
    description: 'Organize the product knowledge that informs your content.',
    icon: 'product',
    navigationKey: 'products',
    group: 'Context Engine',
  },
  {
    path: '/context/products/:id',
    name: 'product-detail',
    title: 'Product Context',
    description:
      'Bring product positioning, audiences, and key messages together.',
    icon: 'product',
    navigationKey: 'products',
    group: 'Context Engine',
    parent: { label: 'Products', to: '/context/products' },
  },
  {
    path: '/settings/integrations',
    name: 'integrations',
    title: 'Integrations',
    description:
      'A central place for your marketing channels and data sources.',
    icon: 'integrations',
    navigationKey: 'integrations',
    group: 'System',
  },
  {
    path: '/settings/ai',
    name: 'ai-system',
    title: 'AI & System',
    description: 'Manage the preferences and guidance behind your workspace.',
    icon: 'system',
    navigationKey: 'ai',
    group: 'System',
  },
]
