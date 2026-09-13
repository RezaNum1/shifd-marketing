import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'
import { cleanupAssets } from './service.js'
import { LocalAssetStorage } from './storage.js'

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const config = loadConfig()
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
  const storage = new LocalAssetStorage(config.assetStorageRoot)
  const dryRun = process.argv.includes('--dry-run')
  try {
    await prisma.$connect()
    await storage.initialize()
    const result = await cleanupAssets(prisma, storage, undefined, config.assetUnattachedGraceHours, new Date(), { dryRun })
    console.log(JSON.stringify(result))
    if (result.failed > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
