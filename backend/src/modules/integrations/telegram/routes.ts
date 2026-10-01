import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../../config/env.js'
import { badRequest, forbidden } from '../../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../../auth/protection.js'
import type { AiProvider } from '../../ai/provider.js'
import { createTelegramLink, disconnectTelegram, parseUpdate, processTelegramUpdate, readTelegramIntegration, telegramIsConfigured, verifyTelegramSecret } from './service.js'
import { TelegramApiClient } from './client.js'

export async function telegramRoutes(app: FastifyInstance, options: { config: AppConfig; aiProvider: AiProvider }) {
  app.get('/integrations/telegram', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await readTelegramIntegration(app.prisma, auth.user.companyId, auth.user.id) })
  })

  app.post('/integrations/telegram/link', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    if (!telegramIsConfigured(options.config)) throw forbidden('Telegram linking is not configured for this environment.')
    requireEmptyBody(request.body)
    return reply.send({ data: await createTelegramLink(app.prisma, options.config, auth.user.companyId, auth.user.id) })
  })

  app.post('/integrations/telegram/disconnect', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    return reply.send({ data: await disconnectTelegram(app.prisma, auth.user.companyId, auth.user.id) })
  })

  app.post('/integrations/telegram/webhook', { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const secret = header(request, 'x-telegram-bot-api-secret-token')
    if (!verifyTelegramSecret(secret, options.config.telegramWebhookSecret)) throw forbidden('The Telegram webhook secret is invalid.')
    if (!contentTypeIsJson(request)) throw badRequest('Telegram webhook payload must be JSON.')
    parseUpdate(request.body)
    try {
      await processTelegramUpdate(app.prisma, options.config, options.aiProvider, request.body, new TelegramApiClient(options.config), (message, details) => request.log.warn({ err: details }, message))
    } catch (error) {
      request.log.error({ err: error }, 'Telegram webhook processing failed after update acceptance.')
    }
    return reply.send({ ok: true })
  })
}

function header(request: FastifyRequest, name: string) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value }
function contentTypeIsJson(request: FastifyRequest) { return (header(request, 'content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() === 'application/json' }
function requireEmptyBody(value: unknown) { if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).length > 0)) throw badRequest('This endpoint does not accept a request body.') }
