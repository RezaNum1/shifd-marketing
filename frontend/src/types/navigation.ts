import type { IconName } from './ui'

export type NavigationKey =
  | 'overview'
  | 'ideas'
  | 'create'
  | 'content'
  | 'calendar'
  | 'performance'
  | 'company'
  | 'products'
  | 'integrations'
  | 'ai'

export interface NavigationItem {
  key: NavigationKey
  label: string
  to: string
  icon: IconName
}

export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

export interface Breadcrumb {
  label: string
  to?: string
}

export interface PageDefinition {
  path: string
  name: string
  title: string
  description: string
  icon: IconName
  navigationKey: NavigationKey
  group: string
  parent?: Breadcrumb
}

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    description: string
    icon: IconName
    navigationKey?: NavigationKey
    breadcrumbs: Breadcrumb[]
  }
}
