import { Prisma, type PrismaClient } from '@prisma/client'
import { notFound, preconditionRequired, revisionConflict } from '../../shared/errors/AppError.js'
import { etag } from '../context/service.js'
import { LINKEDIN_SOURCE } from './metrics.js'

export const LINKEDIN_PUBLICATION_SOURCE = LINKEDIN_SOURCE

export interface LinkedInPublicationMetricInput {
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  totalInteractions: number | null
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
    views: toBigInt(input.views),
    reach: toBigInt(input.reach),
    likes: toBigInt(input.likes),
    comments: toBigInt(input.comments),
    saves: toBigInt(input.saves),
    shares: toBigInt(input.shares),
    totalInteractions: toBigInt(input.totalInteractions),
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
  views: bigint | null
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
    views: row.views === null ? null : Number(row.views),
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
