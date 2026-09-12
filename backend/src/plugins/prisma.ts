import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import type { AppConfig } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (app, options: { config: AppConfig }) => {
  const prisma = new PrismaClient({
    datasources: { db: { url: options.config.databaseUrl } },
  })
  await prisma.$connect()
  app.decorate('prisma', prisma)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})
