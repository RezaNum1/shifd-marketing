import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'
import { M2_PROMPT_METADATA, M2_PROMPT_REFERENCE, promptDigest } from './prompt.js'

export async function seedM2Prompt(prisma: PrismaClient) {
  const digest = promptDigest()
  return prisma.$transaction(async (tx) => {
    const existing = await tx.promptVersion.findUnique({ where: { module_version: { module: M2_PROMPT_METADATA.module, version: M2_PROMPT_METADATA.version } } })
    if (existing && (existing.templateDigest !== digest || existing.templateReference !== M2_PROMPT_REFERENCE || existing.outputSchemaVersion !== M2_PROMPT_METADATA.outputSchemaVersion || existing.operation !== M2_PROMPT_METADATA.operation)) {
      throw new Error('The existing M2 v1 prompt digest or metadata does not match the canonical server resource; refusing to mutate immutable prompt metadata.')
    }
    await tx.promptVersion.updateMany({ where: { module: 'M2', status: 'active', ...(existing ? { id: { not: existing.id } } : {}) }, data: { status: 'retired' } })
    if (!existing) {
      await tx.promptVersion.create({ data: {
        ...M2_PROMPT_METADATA,
        templateReference: M2_PROMPT_REFERENCE,
        templateDigest: digest,
      } })
    } else if (existing.status !== 'active') {
      await tx.promptVersion.update({ where: { id: existing.id }, data: { status: 'active' } })
    }
    return { id: existing?.id ?? null, digest }
  })
}

async function main() {
  const config = loadConfig()
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
  try {
    await prisma.$connect()
    const result = await seedM2Prompt(prisma)
    console.log(`M2 prompt seed verified: ${M2_PROMPT_REFERENCE}; digest ${result.digest}`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'AI prompt seed failed.')
    process.exitCode = 1
  })
}
