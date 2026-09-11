import type { ContentAssetRecord } from '../types/content'

type AssetReference = {
  url: string
  owners: Set<string>
}

const references = new Map<string, AssetReference>()

function isObjectUrl(url: string) {
  return url.startsWith('blob:')
}

function releaseAsset(assetId: string, owner: string) {
  const reference = references.get(assetId)
  if (!reference) return
  reference.owners.delete(owner)
  if (reference.owners.size === 0) {
    if (isObjectUrl(reference.url) && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(reference.url)
    references.delete(assetId)
  }
}

export function releaseCreativeAsset(assetId: string, _url: string, owner: string) {
  releaseAsset(assetId, owner)
}

export function retainCreativeAsset(assetId: string, url: string, owner: string) {
  if (!assetId || !isObjectUrl(url)) return
  const current = references.get(assetId)
  if (current && current.url !== url) {
    if (current.owners.size === 0 && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(current.url)
    references.delete(assetId)
  }
  const reference = references.get(assetId) ?? { url, owners: new Set<string>() }
  reference.url = url
  reference.owners.add(owner)
  references.set(assetId, reference)
}

export function replaceCreativeAssetOwner(owner: string, assets: Pick<ContentAssetRecord, 'id' | 'url'>[]) {
  Array.from(references.entries()).forEach(([assetId, reference]) => {
    if (reference.owners.has(owner)) releaseAsset(assetId, owner)
  })
  assets.forEach((asset) => {
    if (asset.url) retainCreativeAsset(asset.id, asset.url, owner)
  })
}

export function releaseCreativeAssetOwner(owner: string) {
  Array.from(references.entries()).forEach(([assetId, reference]) => {
    if (reference.owners.has(owner)) releaseAsset(assetId, owner)
  })
}

export function retainWorkflowAsset(assetId: string, url: string, workflowId: string) {
  retainCreativeAsset(assetId, url, `workflow:${workflowId}`)
}

export function releaseWorkflowAssets(workflowId: string) {
  releaseCreativeAssetOwner(`workflow:${workflowId}`)
}

export function retainContentAssets(contentId: string, assets: Pick<ContentAssetRecord, 'id' | 'url'>[]) {
  replaceCreativeAssetOwner(`content:${contentId}`, assets)
}
