import { Prisma, PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'
import {
  M2_PROMPT_METADATA, M2_PROMPT_REFERENCE, M3_PROMPT_METADATA, M3_PROMPT_REFERENCE, M4_PROMPT_METADATA,
  M4_PROMPT_REFERENCE,
  m3PromptDigest, m4PromptDigest, promptDigest,
} from './prompt.js'

export async function seedM2Prompt(prisma: PrismaClient) {
  const digest = promptDigest()
  const m3Digest = m3PromptDigest()
  const m4Digest = m4PromptDigest()
  return prisma.$transaction(async (tx) => {
    const m2 = await ensurePrompt(tx, M2_PROMPT_METADATA, M2_PROMPT_REFERENCE, digest)
    const m3 = await ensurePrompt(tx, M3_PROMPT_METADATA, M3_PROMPT_REFERENCE, m3Digest)
    const m4 = await ensurePrompt(tx, M4_PROMPT_METADATA, M4_PROMPT_REFERENCE, m4Digest)
    return { id: m2.id, digest: m2.digest, m3Id: m3.id, m3Digest: m3.digest, m4Id: m4.id, m4Digest: m4.digest }
  })
}

async function ensurePrompt(
  tx: Prisma.TransactionClient,
  metadata: { module: string; operation: string; version: string; status: 'active'; templateReference: string; outputSchemaVersion: string },
  reference: string,
  digest: string,
) {
  const existing = await tx.promptVersion.findUnique({ where: { module_version: { module: metadata.module, version: metadata.version } } })
  if (existing && (existing.templateDigest !== digest || existing.templateReference !== reference || existing.outputSchemaVersion !== metadata.outputSchemaVersion || existing.operation !== metadata.operation || existing.module !== metadata.module || existing.version !== metadata.version)) {
    throw new Error(`The existing ${metadata.module} ${metadata.version} prompt digest or immutable metadata does not match the canonical server resource; refusing to mutate immutable prompt metadata.`)
  }
  await tx.promptVersion.updateMany({ where: { module: metadata.module, status: 'active', ...(existing ? { id: { not: existing.id } } : {}) }, data: { status: 'retired' } })
  if (!existing) {
    const created = await tx.promptVersion.create({ data: { ...metadata, templateReference: reference, templateDigest: digest } })
    return { id: created.id, digest }
  }
  if (existing.status !== 'active') await tx.promptVersion.update({ where: { id: existing.id }, data: { status: 'active' } })
  return { id: existing.id, digest }
}

async function main() {
  const config = loadConfig()
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
  try {
    await prisma.$connect()
    const result = await seedM2Prompt(prisma)
    console.log(`M2/M3/M4 prompt seed verified: ${M2_PROMPT_REFERENCE} ${result.digest}; ${M3_PROMPT_REFERENCE} ${result.m3Digest}; ${M4_PROMPT_REFERENCE} ${result.m4Digest}`)
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
