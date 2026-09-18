import { createRequestKey, request } from './client'
import type { BackendCompanyContext, BackendProduct, BackendResolvedContext, BackendTaxonomy } from '../types/backend'

export function getCompany() {
  return request<BackendCompanyContext>('/company')
}

export function updateCompany(company: { profile: BackendCompanyContext['profile']; brand: BackendCompanyContext['brand']; bmcBlocks: Array<{ type: string; entries: string[] }> }, etag: string | number) {
  const profile = { ...company.profile } as BackendCompanyContext['profile'] & { id?: string }
  delete profile.id
  return request<BackendCompanyContext>('/company', {
    method: 'PUT',
    json: { profile, brand: company.brand, bmcBlocks: company.bmcBlocks.map((block) => ({ type: block.type, entries: block.entries })) },
    ifMatch: etag,
  })
}

export function getResolvedContext(productId?: string) {
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : ''
  return request<BackendResolvedContext>(`/context/resolved${query}`)
}

export function listProducts() {
  return request<BackendProduct[]>('/products?limit=100')
}

export function getProduct(id: string) {
  return request<BackendProduct>(`/products/${id}`)
}

export function createProduct(input: { name: string; description: string; category: string | null; status: string; url: string | null }, idempotencyKey = createRequestKey('product.create')) {
  return request<BackendProduct>('/products', { method: 'POST', json: input, idempotencyKey })
}

export function updateProduct(id: string, product: { name: string; description: string; category: string | null; status: string; url: string | null }, profile: BackendProduct['profile'], etag: string | number) {
  return request<BackendProduct>(`/products/${id}`, { method: 'PUT', json: { product, profile }, ifMatch: etag })
}

export function getTaxonomy() {
  return request<BackendTaxonomy>('/content-taxonomy')
}
