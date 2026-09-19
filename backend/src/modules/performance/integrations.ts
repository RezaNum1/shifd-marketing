import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, revisionConflict } from '../../shared/errors/AppError.js'
import { etag } from '../context/service.js'
import type { Clock } from '../../shared/time/clock.js'
import type { InstagramInsightsProvider } from './instagram/provider.js'
import { connectInstagram, syncInstagram as syncInstagramApi } from './instagram/sync.js'

type IntegrationPlatform = 'instagram' | 'linkedin' | 'whatsapp'
type IntegrationDb = PrismaClient | Prisma.TransactionClient

export interface IntegrationDto {
  id: string
  platform: IntegrationPlatform
  accountName: string | null
  status: 'connected' | 'disconnected' | 'manual'
  mode: 'demo' | 'manual' | 'api'
  currentSource: 'mock' | 'linkedin_manual' | 'instagram_api' | 'manual'
  futureSource: 'instagram_api' | null
  lastSync: string | null
  reportingTimezone: string
  version: number
}

export async function listIntegrations(prisma: PrismaClient, companyId: string) {
  const rows = await prisma.socialAccount.findMany({ where: { companyId }, orderBy: { platform: 'asc' } })
  return ['instagram', 'linkedin', 'whatsapp'].map((platform) => {
    const row = rows.find((candidate) => candidate.platform === platform)
    return row ? mapIntegration(row) : null
  }).reduce<Record<string, IntegrationDto>>((result, item, index) => {
    if (item) result[['instagram', 'linkedin', 'whatsapp'][index]!] = item
    return result
  }, {})
}

export async function updateInstagramIntegration(
  prisma: PrismaClient,
  companyId: string,
  expectedVersion: number,
  action: 'connect' | 'disconnect' | 'sync',
  clock: Clock,
  provider: InstagramInsightsProvider,
) {
  if (action === 'connect') return connectInstagram(prisma, companyId, expectedVersion, provider)
  if (action === 'sync') return syncInstagramApi(prisma, companyId, expectedVersion, provider, clock)
  return prisma.$transaction(async (tx) => {
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

    if (action === 'disconnect') {
      if (account.connectionStatus === 'disconnected') return { integration: mapIntegration(account), etag: etag(account.version) }
      const updated = await tx.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'disconnected', version: { increment: 1 } } })
      return { integration: mapIntegration(updated), etag: etag(updated.version) }
    }

    throw conflict('The Instagram integration action is invalid.')
  })
}

export function mapIntegration(row: {
  id: string
  platform: string
  accountName: string | null
  mode: string
  connectionStatus: string
  reportingTimezone: string
  lastSuccessfulSyncAt: Date | null
  version: number
}) {
  const platform = row.platform as IntegrationPlatform
  const mode = row.mode as IntegrationDto['mode']
  return {
    id: row.id,
    platform,
    accountName: row.accountName,
    status: row.connectionStatus as IntegrationDto['status'],
    mode,
    currentSource: mode === 'demo' ? 'mock' : mode === 'api' ? 'instagram_api' : platform === 'linkedin' ? 'linkedin_manual' : 'manual',
    futureSource: platform === 'instagram' && mode === 'demo' ? 'instagram_api' : null,
    lastSync: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    reportingTimezone: row.reportingTimezone,
    version: row.version,
  } satisfies IntegrationDto
}

export type SocialAccountRow = Prisma.SocialAccountGetPayload<object>

export type IntegrationActionResult = Awaited<ReturnType<typeof updateInstagramIntegration>>

export type IntegrationDbType = IntegrationDb
