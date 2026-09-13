import { Prisma, type PrismaClient } from '@prisma/client'
import { idempotencyConflict } from '../../shared/errors/AppError.js'
import { requestHash } from '../context/normalize.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface IdempotentResponse<T> {
  replay: boolean
  status: number
  body: { data: T }
  etag: string | null
}

interface CommandResult<T> {
  resourceId: string
  status: number
  body: { data: T }
  etag: string | null
}

interface IdempotentCommand<T> {
  companyId: string
  operation: string
  key: string
  normalizedRequest: unknown
  execute: (tx: Prisma.TransactionClient) => Promise<CommandResult<T>>
}

export async function executeIdempotent<T>(prisma: PrismaClient, command: IdempotentCommand<T>): Promise<IdempotentResponse<T>> {
  const hash = requestHash(command.normalizedRequest)
  const existing = await prisma.requestIdempotency.findUnique({
    where: { companyId_operation_key: { companyId: command.companyId, operation: command.operation, key: command.key } },
  })
  if (existing) return replayOrConflict<T>(existing, hash)

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.requestIdempotency.create({
        data: {
          companyId: command.companyId,
          operation: command.operation,
          key: command.key,
          requestHash: hash,
          responseStatus: 201,
          responseBody: {},
          resourceId: '00000000-0000-0000-0000-000000000000',
        },
      })
      const result = await command.execute(tx)
      await tx.requestIdempotency.update({
        where: { companyId_operation_key: { companyId: command.companyId, operation: command.operation, key: command.key } },
        data: {
          resourceId: result.resourceId,
          responseStatus: result.status,
          responseBody: JSON.parse(JSON.stringify(result.body)) as Prisma.InputJsonValue,
          responseEtag: result.etag,
        },
      })
      return { replay: false, status: result.status, body: result.body, etag: result.etag }
    })
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const raced = await prisma.requestIdempotency.findUnique({
        where: { companyId_operation_key: { companyId: command.companyId, operation: command.operation, key: command.key } },
      })
      if (raced) return replayOrConflict<T>(raced, hash)
    }
    throw error
  }
}

function replayOrConflict<T>(record: { requestHash: string; responseStatus: number; responseBody: Prisma.JsonValue; responseEtag: string | null }, hash: string): IdempotentResponse<T> {
  if (record.requestHash !== hash) throw idempotencyConflict()
  return { replay: true, status: record.responseStatus, body: record.responseBody as { data: T }, etag: record.responseEtag }
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export type IdempotencyDb = Db
