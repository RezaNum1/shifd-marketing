import { Prisma, type PrismaClient } from '@prisma/client'
import { instagramAccountInvalid, instagramProviderError, integrationNotConfigured, notFound, revisionConflict } from '../../../shared/errors/AppError.js'
import { etag } from '../../context/service.js'
import type { Clock } from '../../../shared/time/clock.js'
import { CANONICAL_INSTAGRAM_USER_ID, InstagramProviderError, type InstagramAccountReach, type InstagramInsightsProvider, type InstagramMedia, type InstagramMediaInsights, type InstagramProfile } from './provider.js'
import { mapIntegration, type IntegrationDto } from '../integrations.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface InstagramSyncResult {
  integration: IntegrationDto
  etag: string
  mode: 'api'
  metricsChanged: boolean
  matchedPublications: number
  needsSelection: string[]
}

export async function connectInstagram(
  prisma: PrismaClient,
  companyId: string,
  expectedVersion: number,
  provider: InstagramInsightsProvider,
) {
  const profile = await verifiedProfile(provider)
  return prisma.$transaction(async (tx) => {
    const account = await lockInstagramAccount(tx, companyId, expectedVersion)
    const unchanged = account.mode === 'api' && account.connectionStatus === 'connected' && account.externalAccountId === profile.userId && account.accountName === profile.username
    if (unchanged) return { integration: mapIntegration(account), etag: etag(account.version) }
    const updated = await tx.socialAccount.update({
      where: { id: account.id },
      data: {
        mode: 'api',
        connectionStatus: 'connected',
        externalAccountId: profile.userId,
        accountName: profile.username,
        version: { increment: 1 },
      },
    })
    return { integration: mapIntegration(updated), etag: etag(updated.version) }
  })
}

export async function syncInstagram(
  prisma: PrismaClient,
  companyId: string,
  expectedVersion: number,
  provider: InstagramInsightsProvider,
  clock: Clock,
): Promise<InstagramSyncResult> {
  const account = await prisma.socialAccount.findFirst({ where: { companyId, platform: 'instagram' } })
  if (!account) throw notFound()
  if (account.connectionStatus !== 'connected' || account.mode !== 'api') throw integrationNotConfigured()

  const profile = await verifiedProfile(provider)
  const media = await providerCall(() => provider.listMedia())
  const accountReach = await providerCall(() => provider.getAccountReach({ period: 'week' }))
  const publications = await prisma.publicationRecord.findMany({
    where: { variant: { platform: 'instagram', content: { companyId } } },
    include: {
      variant: { select: { platform: true } },
      metrics: { where: { source: 'instagram_api' }, orderBy: [{ observedAt: 'desc' }, { id: 'desc' }], take: 1 },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  })
  const matches = matchPublications(publications, media)
  const observations = await Promise.all(matches.matched.map(async (match) => ({
    publicationRecordId: match.publicationRecordId,
    mediaId: match.media.id,
    insights: await providerCall(() => provider.getMediaInsights(match.media.id)),
  })))
  const now = clock.now()

  return prisma.$transaction(async (tx) => {
    const locked = await lockInstagramAccount(tx, companyId, expectedVersion)
    const week = localWeekBounds(now, locked.reportingTimezone)
    const weeklyReach = genuineWeeklyReach(accountReach)
    if (profile.followersCount !== null) {
      await tx.weeklyMetric.upsert({
        where: { socialAccountId_weekStart_weekEnd: { socialAccountId: locked.id, weekStart: week.start, weekEnd: week.end } },
        create: {
          socialAccountId: locked.id,
          weekStart: week.start,
          weekEnd: week.end,
          followers: BigInt(profile.followersCount),
          reach: weeklyReach === null ? null : BigInt(weeklyReach),
          impressions: null,
          likes: null,
          comments: null,
          saves: null,
          reportedPublishedPosts: 0,
          source: 'instagram_api',
        },
        update: {
          followers: BigInt(profile.followersCount),
          reach: weeklyReach === null ? null : BigInt(weeklyReach),
          impressions: null,
          likes: null,
          comments: null,
          saves: null,
          source: 'instagram_api',
          updatedAt: now,
          version: { increment: 1 },
        },
      })
    }
    for (const observation of observations) {
      await tx.publicationMetric.upsert({
        where: { publicationRecordId_source: { publicationRecordId: observation.publicationRecordId, source: 'instagram_api' } },
        create: {
          publicationRecordId: observation.publicationRecordId,
          socialAccountId: locked.id,
          externalMediaId: observation.mediaId,
          platform: 'instagram',
          observedAt: now,
          ...metricData(observation.insights),
          source: 'instagram_api',
        },
        update: {
          socialAccountId: locked.id,
          externalMediaId: observation.mediaId,
          platform: 'instagram',
          observedAt: now,
          ...metricData(observation.insights),
          updatedAt: now,
          version: { increment: 1 },
        },
      })
    }
    const updated = await tx.socialAccount.update({ where: { id: locked.id }, data: { lastSuccessfulSyncAt: now, version: { increment: 1 } } })
    return {
      integration: mapIntegration(updated),
      etag: etag(updated.version),
      mode: 'api' as const,
      metricsChanged: profile.followersCount !== null || observations.length > 0,
      matchedPublications: observations.length,
      needsSelection: matches.needsSelection,
    }
  })
}

async function verifiedProfile(provider: InstagramInsightsProvider): Promise<InstagramProfile> {
  try {
    const profile = await provider.getProfile()
    if (profile.userId !== CANONICAL_INSTAGRAM_USER_ID || !/^\d+$/.test(profile.userId) || !profile.username || !['BUSINESS', 'CREATOR'].includes((profile.accountType ?? '').toUpperCase())) throw instagramAccountInvalid()
    return profile
  } catch (error) {
    if (error instanceof InstagramProviderError) {
      if (error.status === 503) throw integrationNotConfigured()
      throw instagramProviderError()
    }
    if (error instanceof Error && error.name === 'AppError') throw error
    throw instagramProviderError()
  }
}

async function providerCall<T>(callback: () => Promise<T>) {
  try {
    return await callback()
  } catch (error) {
    if (error instanceof InstagramProviderError) {
      if (error.status === 503) throw integrationNotConfigured()
      throw instagramProviderError()
    }
    throw error
  }
}

async function lockInstagramAccount(tx: Db, companyId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version"
    FROM "social_accounts"
    WHERE "company_id" = CAST(${companyId} AS UUID) AND "platform" = 'instagram'
    FOR UPDATE
  `
  const locked = rows[0]
  if (!locked) throw notFound()
  if (locked.version !== expectedVersion) throw revisionConflict()
  const account = await tx.socialAccount.findUnique({ where: { id: locked.id } })
  if (!account) throw notFound()
  return account
}

function matchPublications(publications: Array<{
  id: string
  postUrl: string | null
  metrics: Array<{ externalMediaId: string }>
}>, media: InstagramMedia[]) {
  const byId = new Map(media.map((item) => [item.id, item]))
  const matched: Array<{ publicationRecordId: string; media: InstagramMedia }> = []
  const needsSelection: string[] = []
  const claimed = new Set<string>()
  for (const publication of publications) {
    const storedMediaId = publication.metrics[0]?.externalMediaId
    if (storedMediaId && byId.has(storedMediaId)) {
      matched.push({ publicationRecordId: publication.id, media: byId.get(storedMediaId)! })
      claimed.add(storedMediaId)
      continue
    }
    if (storedMediaId && !claimed.has(storedMediaId)) {
      matched.push({
        publicationRecordId: publication.id,
        media: { id: storedMediaId, caption: null, mediaType: null, mediaProductType: null, timestamp: new Date(0), permalink: null, thumbnailUrl: null },
      })
      claimed.add(storedMediaId)
      continue
    }
    const permalink = normalizePermalink(publication.postUrl)
    const candidates = permalink ? media.filter((item) => normalizePermalink(item.permalink) === permalink) : []
    if (candidates.length === 1 && !claimed.has(candidates[0]!.id)) {
      matched.push({ publicationRecordId: publication.id, media: candidates[0]! })
      claimed.add(candidates[0]!.id)
    } else if (candidates.length !== 0 || !storedMediaId) {
      needsSelection.push(publication.id)
    }
  }
  return { matched, needsSelection }
}

function normalizePermalink(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!/instagram\.com$/i.test(url.hostname) && !/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ''))) return null
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

function metricData(insights: InstagramMediaInsights) {
  return {
    views: toBigInt(insights.views),
    reach: toBigInt(insights.reach),
    likes: toBigInt(insights.likes),
    comments: toBigInt(insights.comments),
    saves: toBigInt(insights.saves),
    shares: toBigInt(insights.shares),
    totalInteractions: toBigInt(insights.totalInteractions),
  }
}

function toBigInt(value: number | null) {
  return value === null ? null : BigInt(value)
}

function genuineWeeklyReach(value: InstagramAccountReach) {
  return value.period === 'week' && value.values.length === 1 ? value.values[0]!.value : null
}

function localWeekBounds(value: Date, timezone: string) {
  const local = localDate(value, timezone)
  const date = new Date(`${local}T00:00:00.000Z`)
  const daysFromMonday = (date.getUTCDay() + 6) % 7
  const start = new Date(date)
  start.setUTCDate(start.getUTCDate() - daysFromMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return { start: new Date(`${dateOnly(start)}T00:00:00.000Z`), end: new Date(`${dateOnly(end)}T00:00:00.000Z`) }
}

function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}
