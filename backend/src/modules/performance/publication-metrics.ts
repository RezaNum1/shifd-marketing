import { Prisma, type PrismaClient } from '@prisma/client'
import { notFound, preconditionRequired, revisionConflict } from '../../shared/errors/AppError.js'
import { etag } from '../context/service.js'
import { LINKEDIN_SOURCE } from './metrics.js'

export const LINKEDIN_PUBLICATION_SOURCE = LINKEDIN_SOURCE

export interface LinkedInPublicationMetricInput {
  impressions: number | null
  impressionsInNetwork: number | null
  impressionsOutOfNetwork: number | null
  memberReached: number | null
  views: number | null
  followersGained: number | null
  profileViewers: number | null
  reactions: number | null
  comments: number | null
}

export async function saveLinkedInPublicationMetric(
  prisma: PrismaClient,
  companyId: string,
  publicationId: string,
  expectedVersion: number | null,
  input: LinkedInPublicationMetricInput,
  now: Date,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const publication = await tx.publicationRecord.findFirst({
        where: { id: publicationId, variant: { platform: 'linkedin', content: { companyId } } },
        select: { id: true },
      })
      if (!publication) throw notFound()

      const account = await tx.socialAccount.findFirst({ where: { companyId, platform: 'linkedin' }, select: { id: true } })
      if (!account) throw notFound()

      const current = await tx.publicationMetric.findUnique({
        where: { publicationRecordId_source: { publicationRecordId: publicationId, source: LINKEDIN_PUBLICATION_SOURCE } },
      })

      if (current) {
        if (expectedVersion === null) throw preconditionRequired()
        if (current.version !== expectedVersion) throw revisionConflict()
        const result = await tx.publicationMetric.updateMany({
          where: { id: current.id, version: expectedVersion },
          data: {
            ...metricData(input),
            observedAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        })
        if (result.count !== 1) throw revisionConflict()
        const updated = await tx.publicationMetric.findUniqueOrThrow({ where: { id: current.id } })
        await tx.publicationMetricSnapshot.create({ data: { publicationRecordId: publicationId, observedAt: now, ...metricData(input) } })
        return { status: 200 as const, etag: etag(updated.version), data: mapMetric(updated) }
      }

      if (expectedVersion !== null) throw revisionConflict()
      const created = await tx.publicationMetric.create({
        data: {
          publicationRecordId: publicationId,
          socialAccountId: account.id,
          externalMediaId: `linkedin-manual:${publicationId}`,
          platform: 'linkedin',
          observedAt: now,
          ...metricData(input),
          source: LINKEDIN_PUBLICATION_SOURCE,
          version: 1,
        },
      })
      await tx.publicationMetricSnapshot.create({ data: { publicationRecordId: publicationId, observedAt: now, ...metricData(input) } })
      return { status: 201 as const, etag: etag(created.version), data: mapMetric(created) }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw revisionConflict()
    throw error
  }
}

function metricData(input: LinkedInPublicationMetricInput) {
  return {
    impressions: toBigInt(input.impressions),
    impressionsInNetwork: input.impressionsInNetwork,
    impressionsOutOfNetwork: input.impressionsOutOfNetwork,
    memberReached: toBigInt(input.memberReached),
    views: toBigInt(input.views),
    followersGained: toBigInt(input.followersGained),
    profileViewers: toBigInt(input.profileViewers),
    reactions: toBigInt(input.reactions),
    reach: toBigInt(input.memberReached),
    likes: toBigInt(input.reactions),
    comments: toBigInt(input.comments),
  }
}

function toBigInt(value: number | null) {
  return value === null ? null : BigInt(value)
}

function mapMetric(row: {
  id: string
  externalMediaId: string
  source: string
  observedAt: Date
  impressions: bigint | null
  impressionsInNetwork: Prisma.Decimal | null
  impressionsOutOfNetwork: Prisma.Decimal | null
  memberReached: bigint | null
  views: bigint | null
  followersGained: bigint | null
  profileViewers: bigint | null
  reactions: bigint | null
  reach: bigint | null
  likes: bigint | null
  comments: bigint | null
  saves: bigint | null
  shares: bigint | null
  totalInteractions: bigint | null
  version: number
}) {
  return {
    id: row.id,
    scope: 'publication' as const,
    source: row.source,
    externalMediaId: row.externalMediaId,
    impressions: row.impressions === null ? null : Number(row.impressions),
    impressionsInNetwork: row.impressionsInNetwork === null ? null : Number(row.impressionsInNetwork),
    impressionsOutOfNetwork: row.impressionsOutOfNetwork === null ? null : Number(row.impressionsOutOfNetwork),
    memberReached: row.memberReached === null ? null : Number(row.memberReached),
    views: row.views === null ? null : Number(row.views),
    followersGained: row.followersGained === null ? null : Number(row.followersGained),
    profileViewers: row.profileViewers === null ? null : Number(row.profileViewers),
    reactions: row.reactions === null ? null : Number(row.reactions),
    reach: row.reach === null ? null : Number(row.reach),
    likes: row.likes === null ? null : Number(row.likes),
    comments: row.comments === null ? null : Number(row.comments),
    saves: row.saves === null ? null : Number(row.saves),
    shares: row.shares === null ? null : Number(row.shares),
    totalInteractions: row.totalInteractions === null ? null : Number(row.totalInteractions),
    observedAt: row.observedAt.toISOString(),
    version: row.version,
  }
}
