import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import type { AppConfig } from './config/env.js'
import prismaPlugin from './plugins/prisma.js'
import { registerErrorHandler } from './shared/http/errorHandler.js'
import { registerNotFoundHandler } from './shared/http/notFoundHandler.js'
import { healthRoutes } from './modules/health/routes.js'

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
  if (options.connectDatabase ?? true) await app.register(prismaPlugin, { config: options.config })
  await app.register(healthRoutes, { prefix: '/api' })
  return app
}
