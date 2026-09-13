import { Prisma, type PrismaClient } from '@prisma/client'
import { assetInUse, conflict, notFound, revisionConflict, storageFailure, validationError } from '../../shared/errors/AppError.js'
import { readContent } from '../content/service.js'
import { executeIdempotent } from '../content/idempotency.js'
import type { PlatformCode } from '../content/constants.js'
import { etag } from '../context/service.js'
import { AssetStorageMissingError, type AssetStorage, type InspectedImage, type StoredTempFile } from './storage.js'

type Db = PrismaClient | Prisma.TransactionClient

export type AssetPurpose = 'creative' | 'metric_evidence'

export interface AssetUploadInput {
  purpose: AssetPurpose
  fileName: string
  temp: StoredTempFile
  image: InspectedImage
}

export interface AssetDto {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
  purpose: AssetPurpose
  contentUrl: string
  createdAt: string
}

const variantAssetInclude = {
  assetLinks: { orderBy: { sortOrder: 'asc' as const }, include: { asset: true } },
  reuseCreativeFromVariant: true,
} satisfies Prisma.PlatformVariantInclude

const contentVariantInclude = {
  variants: { orderBy: { platform: 'asc' as const }, include: variantAssetInclude },
} satisfies Prisma.ContentInclude

export type AssetContentRow = Prisma.ContentGetPayload<{ include: typeof contentVariantInclude }>

export async function createAsset(
  prisma: PrismaClient,
  storage: AssetStorage,
  companyId: string,
  actorId: string,
  input: AssetUploadInput,
  idempotencyKey: string,
) {
  let finalStorageKey: string | null = null
  let committed = false
  try {
    const result = await executeIdempotent(prisma, {
      companyId,
      operation: 'asset.create',
      key: idempotencyKey,
      normalizedRequest: {
        actorId,
        purpose: input.purpose,
        fileName: input.fileName,
        mimeType: input.image.mimeType,
        sizeBytes: input.temp.sizeBytes,
        width: input.image.width,
        height: input.image.height,
        checksumSha256: input.temp.checksumSha256,
      },
      execute: async (tx) => {
        finalStorageKey = await storage.promote(input.temp.key)
        try {
          const asset = await tx.creativeAsset.create({
            data: {
              companyId,
              uploadedBy: actorId,
              purpose: input.purpose,
              fileName: input.fileName,
              storageKey: finalStorageKey,
              mimeType: input.image.mimeType,
              sizeBytes: BigInt(input.temp.sizeBytes),
              width: input.image.width,
              height: input.image.height,
              checksumSha256: input.temp.checksumSha256,
              state: 'ready',
            },
          })
          const mapped = mapAsset(asset)
          return { resourceId: asset.id, status: 201, body: { data: mapped }, etag: null }
        } catch (error) {
          await safeDelete(storage, finalStorageKey)
          finalStorageKey = null
          throw error
        }
      },
    })
    committed = true
    return result
  } finally {
    if (!committed && finalStorageKey) await safeDelete(storage, finalStorageKey)
    await safeDiscardTemp(storage, input.temp.key)
  }
}

export async function readAsset(prisma: PrismaClient, storage: AssetStorage, companyId: string, assetId: string) {
  const asset = await prisma.creativeAsset.findFirst({ where: { id: assetId, companyId, state: 'ready' } })
  if (!asset) throw notFound()
  try {
    if (!await storage.exists(asset.storageKey)) throw notFound()
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error
    throw storageFailure()
  }
  return mapAsset(asset)
}

export async function openAssetContent(prisma: PrismaClient, storage: AssetStorage, companyId: string, assetId: string) {
  const asset = await prisma.creativeAsset.findFirst({ where: { id: assetId, companyId, state: 'ready' } })
  if (!asset) throw notFound()
  try {
    return { asset: mapAsset(asset), stream: await storage.read(asset.storageKey) }
  } catch (error) {
    if (error instanceof AssetStorageMissingError) throw storageFailure()
    throw error
  }
}

export async function replaceVariantAssets(
  prisma: PrismaClient,
  companyId: string,
  contentId: string,
  expectedVersion: number,
  platform: PlatformCode,
  assetIds: string[],
  actorId: string,
  requestId: string,
) {
  await prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const content = await getAssetContent(tx, companyId, contentId)
    if (content.archivedAt) throw conflict('Archived Content cannot be edited.')
    const variant = content.variants.find((item) => item.platform === platform)
    if (!variant) throw notFound()
    if (new Set(assetIds).size !== assetIds.length) throw validationError('Asset IDs must be unique.', { assetIds: 'Do not repeat an Asset.' })

    await lockAssets(tx, companyId, assetIds)
    const assets = await tx.creativeAsset.findMany({ where: { id: { in: assetIds }, companyId } })
    if (assets.length !== assetIds.length) throw notFound()
    const invalid = assets.find((asset) => asset.state !== 'ready')
    if (invalid) throw notFound()
    if (assets.some((asset) => asset.purpose !== 'creative')) throw validationError('Only creative Assets can attach to a Variant.', { assetIds: 'Use Assets with purpose=creative.' })

    const current = variant.assetLinks.map((link) => link.assetId)
    if (sameIds(current, assetIds)) return
    await tx.variantAsset.deleteMany({ where: { variantId: variant.id } })
    if (assetIds.length) await tx.variantAsset.createMany({ data: assetIds.map((assetId, sortOrder) => ({ variantId: variant.id, assetId, sortOrder })) })
    await tx.content.update({ where: { id: contentId }, data: {
      version: { increment: 1 },
      editorialRevision: { increment: 1 },
      ...(content.editorialStage !== 'draft' ? { editorialStage: 'draft' } : {}),
    } })
    await appendContentEvent(tx, { contentId, variantId: variant.id, actorId, eventType: 'content_updated', metadata: { asset_collection: 'own', action: 'replace', assetCount: assetIds.length }, requestId })
  })
  const content = await readContent(prisma, companyId, contentId)
  return { content, etag: etag(content.version) }
}

export async function setCreativeReuse(
  prisma: PrismaClient,
  companyId: string,
  contentId: string,
  expectedVersion: number,
  reuseInstagramCreative: boolean,
  actorId: string,
  requestId: string,
) {
  await prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const content = await getAssetContent(tx, companyId, contentId)
    if (content.archivedAt) throw conflict('Archived Content cannot be edited.')
    const linkedin = content.variants.find((item) => item.platform === 'linkedin')
    const instagram = content.variants.find((item) => item.platform === 'instagram')
    if (!linkedin || !instagram) throw conflict('Instagram and LinkedIn Variants are required for creative reuse.')
    const nextSource = reuseInstagramCreative ? instagram.id : null
    if (linkedin.reuseCreativeFromVariantId === nextSource) return
    await tx.platformVariant.update({ where: { id: linkedin.id }, data: { reuseCreativeFromVariantId: nextSource } })
    await tx.content.update({ where: { id: contentId }, data: {
      version: { increment: 1 },
      editorialRevision: { increment: 1 },
      ...(content.editorialStage !== 'draft' ? { editorialStage: 'draft' } : {}),
    } })
    await appendContentEvent(tx, { contentId, variantId: linkedin.id, actorId, eventType: 'content_updated', metadata: { asset_collection: 'creative_reuse', enabled: reuseInstagramCreative }, requestId })
  })
  const content = await readContent(prisma, companyId, contentId)
  return { content, etag: etag(content.version) }
}

export async function deleteAsset(prisma: PrismaClient, storage: AssetStorage, companyId: string, assetId: string) {
  const storageKey = await prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, companyId, assetId)
    const references = await tx.variantAsset.count({ where: { assetId } })
    if (references > 0) throw assetInUse()
    await tx.creativeAsset.update({ where: { id: assetId }, data: { state: 'pending_delete' } })
    return asset.storageKey
  })

  try {
    await storage.delete(storageKey)
  } catch {
    throw storageFailure()
  }

  try {
    await prisma.$transaction(async (tx) => {
      const asset = await lockAsset(tx, companyId, assetId)
      const references = await tx.variantAsset.count({ where: { assetId } })
      if (references > 0) throw assetInUse()
      if (asset.state === 'pending_delete') await tx.creativeAsset.delete({ where: { id: assetId } })
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error
    throw storageFailure()
  }
}

export async function cleanupAssets(prisma: PrismaClient, storage: AssetStorage, companyId: string | undefined, graceHours: number, now = new Date(), options: { dryRun?: boolean } = {}) {
  const cutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000)
  const where: Prisma.CreativeAssetWhereInput = { state: 'ready', createdAt: { lt: cutoff }, ...(companyId ? { companyId } : {}) }
  const candidates = await prisma.creativeAsset.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true } })
  let deleted = 0
  let skipped = 0
  let failed = 0
  let eligible = 0
  for (const candidate of candidates) {
    if (options.dryRun) {
      const references = await prisma.variantAsset.count({ where: { assetId: candidate.id } })
      if (references === 0) eligible += 1
      else skipped += 1
      continue
    }
    const pending = await prisma.$transaction(async (tx) => {
      const asset = await lockAsset(tx, companyId, candidate.id)
      const references = await tx.variantAsset.count({ where: { assetId: candidate.id } })
      if (references > 0 || asset.state !== 'ready') return null
      await tx.creativeAsset.update({ where: { id: candidate.id }, data: { state: 'pending_delete' } })
      return asset.storageKey
    })
    if (!pending) {
      skipped += 1
      continue
    }
    try {
      await storage.delete(pending)
      await prisma.$transaction(async (tx) => {
        const asset = await lockAsset(tx, companyId, candidate.id)
        const references = await tx.variantAsset.count({ where: { assetId: candidate.id } })
        if (references === 0 && asset.state === 'pending_delete') await tx.creativeAsset.delete({ where: { id: candidate.id } })
      })
      deleted += 1
    } catch {
      failed += 1
    }
  }
  let orphanRemoved = 0
  const tempRemoved = options.dryRun ? 0 : await storage.cleanupExpiredTemps(cutoff)
  if (!options.dryRun && !companyId) {
    const known = await prisma.creativeAsset.findMany({ select: { storageKey: true } })
    orphanRemoved = await storage.cleanupExpiredOrphans(known.map((asset) => asset.storageKey), cutoff)
  }
  return { deleted, eligible, skipped, failed, tempRemoved, orphanRemoved, cutoff: cutoff.toISOString(), dryRun: options.dryRun === true }
}

export function mapAsset(asset: { id: string; fileName: string; mimeType: string; sizeBytes: bigint; width: number; height: number; purpose: string; createdAt: Date }): AssetDto {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes),
    width: asset.width,
    height: asset.height,
    purpose: asset.purpose as AssetPurpose,
    contentUrl: `/api/assets/${asset.id}/content`,
    createdAt: asset.createdAt.toISOString(),
  }
}

export function sanitizeFileName(value: string) {
  const cleaned = value
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255)
  return cleaned || 'upload'
}

export function validateImageForAsset(image: InspectedImage, maxWidth: number, maxHeight: number) {
  if (image.width > maxWidth || image.height > maxHeight) throw validationError('The image dimensions exceed the configured limit.', { file: `Maximum dimensions are ${maxWidth}x${maxHeight}.` })
}

async function getAssetContent(db: Db, companyId: string, contentId: string): Promise<AssetContentRow> {
  const content = await db.content.findFirst({ where: { id: contentId, companyId }, include: contentVariantInclude })
  if (!content) throw notFound()
  return content
}

async function lockContent(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version" FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  if (!rows[0]) throw notFound()
  if (rows[0].version !== expectedVersion) throw revisionConflict()
}

async function lockAssets(tx: Prisma.TransactionClient, companyId: string, assetIds: string[]) {
  if (!assetIds.length) return
  const orderedIds = [...assetIds].sort()
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "creative_assets"
    WHERE "company_id" = CAST(${companyId} AS UUID)
      AND "id" IN (${Prisma.join(orderedIds.map((id) => Prisma.sql`CAST(${id} AS UUID)`))})
    ORDER BY "id"
    FOR UPDATE
  `
}

async function lockAsset(tx: Prisma.TransactionClient, companyId: string | undefined, assetId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; storageKey: string; state: string }>>`
    SELECT "id", "storage_key" AS "storageKey", "state" FROM "creative_assets"
    WHERE "id" = CAST(${assetId} AS UUID) ${companyId ? Prisma.sql`AND "company_id" = CAST(${companyId} AS UUID)` : Prisma.empty}
    FOR UPDATE
  `
  if (!rows[0]) throw notFound()
  return rows[0]
}

async function appendContentEvent(tx: Prisma.TransactionClient, input: { contentId: string; variantId: string; actorId: string; eventType: string; metadata: Record<string, unknown>; requestId: string }) {
  await tx.contentEvent.create({ data: {
    contentId: input.contentId,
    variantId: input.variantId,
    actorId: input.actorId,
    actorKind: 'user',
    eventType: input.eventType,
    metadata: JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue,
    requestId: input.requestId,
  } })
}

function sameIds(current: string[], next: string[]) {
  return current.length === next.length && current.every((id, index) => id === next[index])
}

async function safeDelete(storage: AssetStorage, storageKey: string | null) {
  if (!storageKey) return
  try { await storage.delete(storageKey) } catch { /* best effort cleanup */ }
}

async function safeDiscardTemp(storage: AssetStorage, tempKey: string) {
  try { await storage.discardTemp(tempKey) } catch { /* best effort cleanup */ }
}
