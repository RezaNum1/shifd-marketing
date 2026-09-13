import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'

const DEFAULT_AGE_MINUTES = 15

export async function recoverInterruptedAiRequests(prisma: PrismaClient, olderThanMinutes = DEFAULT_AGE_MINUTES) {
  if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1) throw new Error('The recovery age must be a positive integer.')
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const result = await prisma.aiRequestLog.updateMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    data: { status: 'failed', errorCode: 'AI_INTERRUPTED', errorMessage: 'The server did not complete the AI request; no automatic retry was attempted.', completedAt: new Date() },
  })
  return result.count
}

async function main() {
  const config = loadConfig()
  const age = process.argv[2] === undefined ? DEFAULT_AGE_MINUTES : Number(process.argv[2])
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
  try {
    await prisma.$connect()
    console.log(`Marked ${await recoverInterruptedAiRequests(prisma, age)} interrupted AI request(s) as failed. No provider calls were made.`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'AI recovery failed.')
    process.exitCode = 1
  })
}

