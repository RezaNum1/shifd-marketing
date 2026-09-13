import { requestHash } from '../context/normalize.js'

export interface BrandHashParts {
  content: {
    id: string
    contextType: string
    productId: string | null
    masterRevision: number
    master: unknown
    visualDirection: unknown
  }
  brief: unknown
  variant: unknown
  company: unknown
  product: unknown
  brand: unknown
  resolvedBrand: unknown
  contextVersions: { company: number; product: number | null }
  ai: unknown
}

export function buildBrandRelevantSnapshot(parts: BrandHashParts) {
  return {
    content: parts.content,
    brief: parts.brief,
    variant: parts.variant,
    company: parts.company,
    product: parts.product,
    brand: parts.brand,
    resolvedBrand: parts.resolvedBrand,
    contextVersions: parts.contextVersions,
    ai: parts.ai,
  }
}

export function brandRelevantInputHash(parts: BrandHashParts) {
  return requestHash(buildBrandRelevantSnapshot(parts))
}
