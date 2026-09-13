import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import type { AppConfig } from './config/env.js'
import prismaPlugin from './plugins/prisma.js'
import authPlugin from './modules/auth/plugin.js'
import { authRoutes } from './modules/auth/routes.js'
import rateLimit from '@fastify/rate-limit'
import { registerErrorHandler } from './shared/http/errorHandler.js'
import { registerNotFoundHandler } from './shared/http/notFoundHandler.js'
import { healthRoutes } from './modules/health/routes.js'
import { contextRoutes } from './modules/context/routes.js'
import { contentRoutes } from './modules/content/routes.js'
import multipart from '@fastify/multipart'
import { assetRoutes } from './modules/assets/routes.js'
import { LocalAssetStorage } from './modules/assets/storage.js'

export interface BuildAppOptions {
  config: AppConfig
  logger?: boolean
  connectDatabase?: boolean
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })
  registerErrorHandler(app)
  registerNotFoundHandler(app)
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin === options.config.allowedOrigin ? origin : false)
    },
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  if (options.connectDatabase ?? true) await app.register(prismaPlugin, { config: options.config })
  const assetStorage = new LocalAssetStorage(options.config.assetStorageRoot)
  await assetStorage.initialize()
  await app.register(multipart, { throwFileSizeLimit: false, limits: { files: 1, fields: 1, parts: 2, fileSize: options.config.assetMaxBytes } })
  await app.register(authPlugin, { config: options.config })
  await app.register(authRoutes, { config: options.config, prefix: '/api' })
  await app.register(contextRoutes, { config: options.config, prefix: '/api' })
  await app.register(contentRoutes, { config: options.config, prefix: '/api' })
  await app.register(assetRoutes, { config: options.config, storage: assetStorage, prefix: '/api' })
  await app.register(healthRoutes, { prefix: '/api' })
  return app
}
