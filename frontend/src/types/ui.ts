export type IconName =
  | 'overview'
  | 'idea'
  | 'sparkles'
  | 'library'
  | 'calendar'
  | 'chart'
  | 'company'
  | 'product'
  | 'integrations'
  | 'system'
  | 'search'
  | 'bell'
  | 'help'
  | 'settings'
  | 'menu'
  | 'close'
  | 'chevron-right'
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'circle'
  | 'info'
  | 'alert'
  | 'plus'
  | 'upload'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type ControlSize = 'compact' | 'default' | 'comfortable'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface StepItem {
  id: string
  label: string
  description?: string
  complete?: boolean
  disabled?: boolean
}

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}
