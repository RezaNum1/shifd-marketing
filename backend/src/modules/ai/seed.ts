import { Prisma, PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'
import {
  M2_PROMPT_METADATA, M2_PROMPT_REFERENCE, M3_PROMPT_METADATA, M3_PROMPT_REFERENCE, M4_PROMPT_METADATA,
  M4_PROMPT_REFERENCE,
  m3PromptDigest, m4PromptDigest, promptDigest,
} from './prompt.js'
import { M2_DISCOVERY_PROMPT_METADATA, M2_DISCOVERY_PROMPT_REFERENCE, m2DiscoveryPromptDigest } from './discovery-prompt.js'
import { M2_TELEGRAM_PROMPT_METADATA } from './telegram-ideation-prompt.js'
import { PROSPECT_RESEARCH_METADATA, prospectResearchPromptDigest } from './prospect-research-prompt.js'
import { PROSPECT_EMAIL_DRAFT_METADATA, prospectEmailDraftPromptDigest } from './prospect-email-draft-prompt.js'

export async function seedM2Prompt(prisma: PrismaClient) {
  const registry = promptSeedRegistry()
  return prisma.$transaction(async (tx) => {
    const seeded = new Map<string, { id: string; digest: string }>()
    for (const entry of registry) seeded.set(entry.key, await ensurePrompt(tx, entry.metadata, entry.reference, entry.digest))
    const result = (key: string) => seeded.get(key)!
    return {
      id: result('m2').id, digest: result('m2').digest,
      discoveryId: result('discovery').id, discoveryDigest: result('discovery').digest,
      m3Id: result('m3').id, m3Digest: result('m3').digest,
      m4Id: result('m4').id, m4Digest: result('m4').digest,
      prospectResearchId: result('prospectResearch').id, prospectResearchDigest: result('prospectResearch').digest,
      prospectEmailDraftId: result('prospectEmailDraft').id, prospectEmailDraftDigest: result('prospectEmailDraft').digest,
      telegram: registry.filter((entry) => entry.key.startsWith('telegram:')).map((entry) => result(entry.key)),
    }
  })
}

export async function ensureProspectResearchPrompt(prisma: PrismaClient) {
  return prisma.$transaction((tx) => ensurePrompt(
    tx,
    PROSPECT_RESEARCH_METADATA,
    PROSPECT_RESEARCH_METADATA.templateReference,
    prospectResearchPromptDigest(),
  ))
}

export async function ensureProspectEmailDraftPrompt(prisma: PrismaClient) {
  return prisma.$transaction((tx) => ensurePrompt(
    tx,
    PROSPECT_EMAIL_DRAFT_METADATA,
    PROSPECT_EMAIL_DRAFT_METADATA.templateReference,
    prospectEmailDraftPromptDigest(),
  ))
}

export function promptSeedRegistry() {
  return [
    { key: 'm2', metadata: M2_PROMPT_METADATA, reference: M2_PROMPT_REFERENCE, digest: promptDigest() },
    { key: 'discovery', metadata: M2_DISCOVERY_PROMPT_METADATA, reference: M2_DISCOVERY_PROMPT_REFERENCE, digest: m2DiscoveryPromptDigest() },
    { key: 'm3', metadata: M3_PROMPT_METADATA, reference: M3_PROMPT_REFERENCE, digest: m3PromptDigest() },
    { key: 'm4', metadata: M4_PROMPT_METADATA, reference: M4_PROMPT_REFERENCE, digest: m4PromptDigest() },
    { key: 'prospectResearch', metadata: PROSPECT_RESEARCH_METADATA, reference: PROSPECT_RESEARCH_METADATA.templateReference, digest: prospectResearchPromptDigest() },
    { key: 'prospectEmailDraft', metadata: PROSPECT_EMAIL_DRAFT_METADATA, reference: PROSPECT_EMAIL_DRAFT_METADATA.templateReference, digest: prospectEmailDraftPromptDigest() },
    ...M2_TELEGRAM_PROMPT_METADATA.map((metadata) => ({ key: `telegram:${metadata.operation}`, metadata, reference: metadata.templateReference, digest: metadata.digest })),
  ]
}

async function ensurePrompt(
  tx: Prisma.TransactionClient,
  metadata: { module: string; operation: string; version: string; status: 'active'; templateReference: string; outputSchemaVersion: string; digest?: string },
  reference: string,
  digest: string,
) {
  const existing = await tx.promptVersion.findUnique({ where: { module_version: { module: metadata.module, version: metadata.version } } })
  if (existing && (existing.templateDigest !== digest || existing.templateReference !== reference || existing.outputSchemaVersion !== metadata.outputSchemaVersion || existing.operation !== metadata.operation || existing.module !== metadata.module || existing.version !== metadata.version)) {
    throw new Error(`The existing ${metadata.module} ${metadata.version} prompt digest or immutable metadata does not match the canonical server resource; refusing to mutate immutable prompt metadata.`)
  }
  await tx.promptVersion.updateMany({ where: { module: metadata.module, operation: metadata.operation, status: 'active', ...(existing ? { id: { not: existing.id } } : {}) }, data: { status: 'retired' } })
  if (!existing) {
    const created = await tx.promptVersion.create({ data: { module: metadata.module, operation: metadata.operation, version: metadata.version, status: metadata.status, templateReference: reference, templateDigest: digest, outputSchemaVersion: metadata.outputSchemaVersion } })
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
    console.log(`M2/M3/M4 prompt seed verified: ${M2_PROMPT_REFERENCE} ${result.digest}; ${M2_DISCOVERY_PROMPT_REFERENCE} ${result.discoveryDigest}; ${M3_PROMPT_REFERENCE} ${result.m3Digest}; ${M4_PROMPT_REFERENCE} ${result.m4Digest}`)
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
