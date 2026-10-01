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
import { OpenAiAiProvider } from './modules/ai/openai.js'
import { aiRoutes } from './modules/ai/routes.js'
import type { AiProvider } from './modules/ai/provider.js'
import type { AiImageProvider } from './modules/ai/provider.js'
import { creativeReferenceRoutes } from './modules/creative-references/routes.js'
import { systemClock, type Clock } from './shared/time/clock.js'
import { schedulingRoutes } from './modules/scheduling/routes.js'
import { performanceRoutes } from './modules/performance/routes.js'
import { MetaInstagramInsightsProvider } from './modules/performance/instagram/meta.js'
import type { InstagramInsightsProvider } from './modules/performance/instagram/provider.js'
import { topicDiscoveryRoutes } from './modules/ideas/routes.js'
import type { TopicDiscoveryProvider } from './modules/ai/provider.js'
import { telegramRoutes } from './modules/integrations/telegram/routes.js'

export interface BuildAppOptions {
  config: AppConfig
  logger?: boolean
  connectDatabase?: boolean
  aiProvider?: AiProvider
  discoveryProvider?: TopicDiscoveryProvider
  imageProvider?: AiImageProvider
  instagramProvider?: InstagramInsightsProvider
  clock?: Clock
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })
  registerErrorHandler(app, options.config.nodeEnv)
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
  const aiProvider = options.aiProvider ?? new OpenAiAiProvider(options.config)
  const discoveryProvider = options.discoveryProvider ?? new OpenAiAiProvider(options.config)
  const imageProvider = options.imageProvider ?? new OpenAiAiProvider(options.config)
  const clock = options.clock ?? systemClock
  const instagramProvider = options.instagramProvider ?? new MetaInstagramInsightsProvider(options.config)
  await app.register(contentRoutes, { config: options.config, aiProvider, clock, prefix: '/api' })
  await app.register(topicDiscoveryRoutes, { config: options.config, provider: discoveryProvider, prefix: '/api' })
  await app.register(schedulingRoutes, { config: options.config, clock, prefix: '/api' })
  await app.register(performanceRoutes, { config: options.config, clock, instagramProvider, prefix: '/api' })
  await app.register(telegramRoutes, { config: options.config, aiProvider, prefix: '/api' })
  await app.register(aiRoutes, { config: options.config, prefix: '/api' })
  await app.register(assetRoutes, { config: options.config, storage: assetStorage, prefix: '/api' })
  await app.register(creativeReferenceRoutes, { config: options.config, aiProvider, imageProvider, storage: assetStorage, prefix: '/api' })
  await app.register(healthRoutes, { prefix: '/api' })
  return app
}
