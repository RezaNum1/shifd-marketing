import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { notFound, validationError } from '../../shared/errors/AppError.js'
import { openAssetContent } from '../assets/service.js'
import type { AssetStorage } from '../assets/storage.js'
import { readContent } from '../content/service.js'

const SHARE_TTL_DAYS = 7
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,80}$/

export async function createReviewShare(prisma: PrismaClient, companyId: string, actorId: string, contentId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, companyId, archivedAt: null }, select: { id: true } })
  if (!content) throw notFound()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000)
  await prisma.$transaction([
    prisma.contentReviewShare.updateMany({ where: { contentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.contentReviewShare.create({ data: { contentId, createdBy: actorId, tokenHash: hashToken(token), expiresAt } }),
  ])
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function reviewShareStatus(prisma: PrismaClient, companyId: string, contentId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, companyId }, select: { id: true, archivedAt: true } })
  if (!content) throw notFound()
  if (content.archivedAt) return { active: false, expiresAt: null, createdAt: null }
  const share = await prisma.contentReviewShare.findFirst({ where: { contentId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { expiresAt: true, createdAt: true } })
  return share ? { active: true, expiresAt: share.expiresAt.toISOString(), createdAt: share.createdAt.toISOString() } : { active: false, expiresAt: null, createdAt: null }
}

export async function revokeReviewShare(prisma: PrismaClient, companyId: string, contentId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, companyId }, select: { id: true } })
  if (!content) throw notFound()
  await prisma.contentReviewShare.updateMany({ where: { contentId, revokedAt: null }, data: { revokedAt: new Date() } })
}

export async function readPublicReview(prisma: PrismaClient, token: string) {
  const share = await findActiveShare(prisma, token)
  const content = await readContent(prisma, share.content.companyId, share.contentId)
  const variants = content.variants.filter((variant) => variant.enabled).map((variant) => ({
    platform: variant.platform,
    copy: variant.copy,
    cta: variant.cta,
    hashtags: variant.hashtags,
    visualRecommendation: variant.visualRecommendation,
    assets: variant.effectiveAssets.map((item) => ({
      id: item.asset.id,
      fileName: item.asset.fileName,
      mimeType: item.asset.mimeType,
      width: item.asset.width,
      height: item.asset.height,
      contentUrl: `/api/public-review/${encodeURIComponent(token)}/assets/${item.asset.id}`,
    })),
    assessment: variant.assessment ? {
      score: variant.assessment.score,
      status: variant.assessment.status,
      recommendation: variant.assessment.recommendation,
      checks: variant.assessment.checks,
      freshness: variant.assessment.freshness,
    } : null,
  }))
  return {
    title: content.title,
    brief: content.brief,
    master: content.master,
    visualDirection: content.visualDirection,
    designStatus: content.designStatus,
    variants,
    updatedAt: content.updatedAt,
    expiresAt: share.expiresAt.toISOString(),
  }
}

export async function openPublicReviewAsset(prisma: PrismaClient, storage: AssetStorage, token: string, assetId: string) {
  const share = await findActiveShare(prisma, token)
  const content = await readContent(prisma, share.content.companyId, share.contentId)
  const allowedAssetIds = new Set(content.variants.filter((variant) => variant.enabled).flatMap((variant) => variant.effectiveAssets.map((item) => item.asset.id)))
  if (!allowedAssetIds.has(assetId)) throw notFound()
  return openAssetContent(prisma, storage, share.content.companyId, assetId)
}

async function findActiveShare(prisma: PrismaClient, token: string) {
  if (!TOKEN_PATTERN.test(token)) throw notFound()
  const share = await prisma.contentReviewShare.findUnique({ where: { tokenHash: hashToken(token) }, include: { content: { select: { id: true, companyId: true, archivedAt: true } } } })
  if (!share || share.revokedAt || share.expiresAt <= new Date() || share.content.archivedAt) throw notFound()
  return share
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function validateShareCreateBody(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) return
  throw validationError('The review link request is invalid.', { body: 'Use an empty object.' })
}
