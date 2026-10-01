import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { AppConfig } from '../../../config/env.js'
import { aiNotConfigured, aiOutputInvalid, badRequest, conflict, forbidden, notFound } from '../../../shared/errors/AppError.js'
import { readResolvedContextFromDb, readTaxonomy } from '../../context/service.js'
import { createIdeaInTransaction } from '../../content/service.js'
import { AI_MODEL_ID, AI_PROVIDER, M2_TELEGRAM_CHAT_OPERATION, M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION, M2_TELEGRAM_STRUCTURE_OPERATION, M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION } from '../../ai/constants.js'
import { mapProviderFailure } from '../../ai/service.js'
import { M2_TELEGRAM_CHAT_SYSTEM_PROMPT, M2_TELEGRAM_STRUCTURE_SYSTEM_PROMPT, renderTelegramChatPrompt, renderTelegramStructurePrompt } from '../../ai/telegram-ideation-prompt.js'
import type { AiProvider } from '../../ai/provider.js'
import { TelegramApiClient, type TelegramClient, type TelegramInlineKeyboardButton } from './client.js'

const MAX_TELEGRAM_TEXT = 4_000
const HISTORY_LIMIT = 20
const CALLBACK_TTL_MINUTES = 30

type TelegramMessage = { message_id?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown; username?: unknown }; text?: unknown }
type TelegramCallbackQuery = { id?: unknown; from?: { id?: unknown }; message?: { message_id?: unknown; chat?: { id?: unknown; type?: unknown } }; data?: unknown }
type TelegramUpdate = { update_id?: unknown; message?: TelegramMessage; callback_query?: TelegramCallbackQuery }

export function telegramIsConfigured(config: AppConfig) {
  return Boolean(config.telegramBotToken && config.telegramBotUsername && config.telegramWebhookSecret)
}

export async function createTelegramLink(prisma: PrismaClient, config: AppConfig, companyId: string, userId: string) {
  if (!config.telegramBotUsername) throw conflict('Telegram is not configured for account linking.')
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (config.telegramLinkTokenTtlMinutes ?? 10) * 60_000)
  await prisma.$transaction(async (tx) => {
    await tx.telegramLinkToken.updateMany({ where: { companyId, userId, consumedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.telegramLinkToken.create({ data: { companyId, userId, tokenHash: hashToken(rawToken), expiresAt } })
  })
  return { telegramDeepLink: `https://t.me/${encodeURIComponent(config.telegramBotUsername.replace(/^@/u, ''))}?start=${rawToken}`, expiresAt: expiresAt.toISOString() }
}

export async function readTelegramIntegration(prisma: PrismaClient, companyId: string, userId: string) {
  const integration = await prisma.telegramIntegration.findFirst({ where: { companyId, userId }, orderBy: { updatedAt: 'desc' }, include: { activeProduct: { select: { id: true, name: true } } } })
  if (!integration || integration.status !== 'active') return { status: 'disconnected' as const, telegramUsername: null, activeProduct: null, linkedAt: null }
  return { status: 'connected' as const, telegramUsername: integration.telegramUsernameSnapshot, activeProduct: integration.activeProduct, linkedAt: integration.linkedAt.toISOString() }
}

export async function disconnectTelegram(prisma: PrismaClient, companyId: string, userId: string) {
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const integrations = await tx.telegramIntegration.findMany({ where: { companyId, userId, status: 'active' }, select: { id: true } })
    await tx.telegramLinkToken.updateMany({ where: { companyId, userId, consumedAt: null, revokedAt: null }, data: { revokedAt: now } })
    await tx.telegramIdeaDraft.updateMany({ where: { companyId, userId, status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: now } })
    if (integrations.length) {
      await tx.telegramIntegration.updateMany({ where: { id: { in: integrations.map((item) => item.id) } }, data: { status: 'inactive', unlinkedAt: now, activeProductId: null } })
      await tx.telegramIdeationThread.updateMany({ where: { integrationId: { in: integrations.map((item) => item.id) }, status: 'active' }, data: { status: 'abandoned', closedAt: now } })
      await tx.telegramCallbackToken.updateMany({ where: { integrationId: { in: integrations.map((item) => item.id) }, usedAt: null }, data: { usedAt: now } })
    }
  })
  return readTelegramIntegration(prisma, companyId, userId)
}

export async function processTelegramUpdate(prisma: PrismaClient, config: AppConfig, provider: AiProvider, update: unknown, client: TelegramClient = new TelegramApiClient(config), log: (message: string, details?: unknown) => void = () => {}) {
  const parsed = parseUpdate(update)
  const updateId = parsed.update_id as number
  const claimed = await claimUpdate(prisma, updateId)
  if (!claimed) return
  try {
    if (parsed.callback_query) await processCallback(prisma, config, parsed.callback_query, client, log)
    else if (parsed.message) await processMessage(prisma, config, provider, parsed.message, client, log)
    await prisma.telegramWebhookUpdate.update({ where: { updateId: BigInt(updateId) }, data: { status: 'processed', processedAt: new Date() } })
  } catch (error) {
    await prisma.telegramWebhookUpdate.update({ where: { updateId: BigInt(updateId) }, data: { status: 'failed', processedAt: new Date() } }).catch(() => {})
    throw error
  }
}

export function verifyTelegramSecret(actual: string | undefined, expected: string | null | undefined) {
  if (!actual || !expected) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function processMessage(prisma: PrismaClient, config: AppConfig, provider: AiProvider, message: TelegramMessage, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  if (message.chat?.type !== 'private' || !stringId(message.chat.id) || !stringId(message.from?.id)) return
  const chatId = stringId(message.chat.id)!
  const telegramUserId = stringId(message.from?.id)!
  const messageId = stringId(message.message_id)
  const text = typeof message.text === 'string' ? message.text.trim() : ''
  if (!text) {
    const integration = await activeIntegration(prisma, telegramUserId, chatId)
    if (integration) await safeSend(client, chatId, 'This Telegram integration currently supports text ideation only.', log)
    return
  }
  if (text.length > MAX_TELEGRAM_TEXT) { await safeSend(client, chatId, 'Please keep ideation messages under 4,000 characters.', log); return }
  if (text.startsWith('/start')) {
    const token = text.slice('/start'.length).trim()
    if (token) {
      try { await linkTelegramIdentity(prisma, token, telegramUserId, chatId, message.from?.username, client, log) }
      catch (error) { await safeSend(client, chatId, error instanceof Error ? error.message : 'This Telegram link is invalid or expired. Generate a new link in Settings.', log) }
    }
    else await safeSend(client, chatId, 'This bot is available to linked Shifd Marketing founders. Generate a link from Settings → Integrations.', log)
    return
  }
  const integration = await activeIntegration(prisma, telegramUserId, chatId)
  if (!integration) { await safeSend(client, chatId, 'This Telegram account is not linked to Shifd Marketing. Generate a link from Settings → Integrations, then use /start.', log); return }
  if (isCommand(text, '/help')) return safeSend(client, chatId, helpText(), log)
  if (isCommand(text, '/context')) return safeSend(client, chatId, await contextText(prisma, integration), log)
  if (isCommand(text, '/product')) return showProducts(prisma, integration, client, log)
  if (isCommand(text, '/company')) return switchContext(prisma, integration, null, client, log)
  if (isCommand(text, '/new')) return newThread(prisma, integration, client, log)
  if (isCommand(text, '/cancel')) return cancelDraft(prisma, integration, client, log)
  if (isCommand(text, '/save') || explicitSavePhrase(text)) return structureIdea(prisma, config, provider, integration, messageId, text, client, log)
  return chat(prisma, config, provider, integration, messageId, text, client, log)
}

async function processCallback(prisma: PrismaClient, config: AppConfig, callback: TelegramCallbackQuery, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const callbackId = typeof callback.id === 'string' ? callback.id : null
  const fromId = stringId(callback.from?.id)
  const chatId = stringId(callback.message?.chat?.id)
  const data = typeof callback.data === 'string' ? callback.data : ''
  if (callbackId) await client.answerCallbackQuery(callbackId).catch((error) => log('Telegram callback acknowledgement failed.', error))
  if (callback.message?.chat?.type !== 'private' || !fromId || !chatId || !data.startsWith('t:')) return
  const integration = await activeIntegration(prisma, fromId, chatId)
  if (!integration) return safeSend(client, chatId, 'This Telegram account is not linked.', log)
  const raw = data.slice(2)
  const token = await prisma.telegramCallbackToken.findUnique({ where: { tokenHash: hashToken(raw) } })
  if (!token || token.integrationId !== integration.id || token.expiresAt <= new Date()) return safeSend(client, chatId, 'This button has expired. Please request the action again.', log)
  if (token.usedAt) {
    if (token.action === 'save_draft' && token.draftId) {
      const saved = await prisma.telegramIdeaDraft.findFirst({ where: { id: token.draftId, companyId: integration.companyId, userId: integration.userId, status: 'saved' } })
      if (saved) return safeSend(client, chatId, 'This idea has already been saved.', log)
    }
    return safeSend(client, chatId, 'This button has already been used.', log)
  }
  if (token.action === 'select_product' && token.productId) return switchContext(prisma, integration, token.productId, client, log, token.id)
  if ((token.action === 'save_draft' || token.action === 'cancel_draft') && token.draftId) return token.action === 'save_draft'
    ? confirmDraft(prisma, integration, token.id, token.draftId, client, log)
    : cancelDraft(prisma, integration, client, log, token.id, token.draftId)
  await markCallbackUsed(prisma, token.id)
}

async function linkTelegramIdentity(prisma: PrismaClient, rawToken: string, telegramUserId: string, telegramChatId: string, username: unknown, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const now = new Date()
  const linked = await prisma.$transaction(async (tx) => {
    const token = await tx.telegramLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } })
    if (!token || token.consumedAt || token.revokedAt || token.expiresAt <= now) throw conflict('This Telegram link has expired or was already used. Generate a new link in Settings.')
    const existing = await tx.telegramIntegration.findFirst({ where: { OR: [{ telegramUserId }, { telegramChatId }] } })
    if (existing && (existing.companyId !== token.companyId || existing.userId !== token.userId)) throw conflict('This Telegram account is already linked to another Shifd Marketing account.')
    const integration = existing
      ? await tx.telegramIntegration.update({ where: { id: existing.id }, data: { status: 'active', telegramUserId, telegramChatId, telegramUsernameSnapshot: typeof username === 'string' ? username : null, activeProductId: null, linkedAt: now, unlinkedAt: null } })
      : await tx.telegramIntegration.create({ data: { companyId: token.companyId, userId: token.userId, telegramUserId, telegramChatId, telegramUsernameSnapshot: typeof username === 'string' ? username : null } })
    await tx.telegramLinkToken.update({ where: { id: token.id }, data: { consumedAt: now } })
    return integration
  })
  await safeSend(client, telegramChatId, `Telegram linked to Shifd Marketing.\n\nUse /context to see your active Company/Product context.\nUse /help for ideation commands.`, log)
  return linked
}

async function chat(prisma: PrismaClient, config: AppConfig, provider: AiProvider, integration: Integration, messageId: string | null, text: string, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const thread = await prepareThreadMessage(prisma, integration, messageId, text)
  const context = await buildContext(prisma, integration)
  const prompt = await activePrompt(prisma, M2_TELEGRAM_CHAT_OPERATION)
  const model = await modelFor(prisma, config, integration.companyId, provider)
  const aiRequestId = randomUUID()
  const startedAt = Date.now()
  await prisma.aiRequestLog.create({ data: aiLogData({ id: aiRequestId, companyId: integration.companyId, userId: integration.userId, promptVersionId: prompt.id, operation: M2_TELEGRAM_CHAT_OPERATION, model, snapshot: { context, history: thread.history, message: text } }) })
  let result
  try {
    result = await provider.generate({ model, outputSchemaVersion: M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION, systemPrompt: M2_TELEGRAM_CHAT_SYSTEM_PROMPT, userPrompt: renderTelegramChatPrompt({ ...context, history: thread.history, message: text }), maxOutputTokens: config.telegramIdeationMaxOutputTokens ?? 800, timeoutMs: config.aiRequestTimeoutMs })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await failAi(prisma, aiRequestId, failure, Date.now() - startedAt, error)
    await safeSend(client, integration.telegramChatId, 'I could not process that ideation message right now. Please try again later.', log)
    return
  }
  let parsed: { reply: string }
  try { parsed = parseChatResult(result.text) }
  catch (error) {
    const failure = error instanceof Error ? error : aiOutputInvalid()
    await failAi(prisma, aiRequestId, { code: 'AI_OUTPUT_INVALID', message: failure.message }, Date.now() - startedAt, null, result.providerRequestId)
    await safeSend(client, integration.telegramChatId, 'I could not read the ideation response. Please try again later.', log)
    return
  }
  await prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: { status: 'success', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: result.inputTokens, outputTokens: result.outputTokens, providerRequestId: result.providerRequestId } })
  await prisma.telegramIdeationMessage.create({ data: { threadId: thread.threadId, role: 'assistant', text: parsed.reply, aiRequestLogId: aiRequestId } })
  await prisma.telegramIdeationThread.update({ where: { id: thread.threadId }, data: { revision: { increment: 1 } } })
  await safeSend(client, integration.telegramChatId, parsed.reply, log)
}

async function structureIdea(prisma: PrismaClient, config: AppConfig, provider: AiProvider, integration: Integration, messageId: string | null, text: string, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const active = await getActiveThread(prisma, integration)
  if (!active) await getOrCreateThread(prisma, integration)
  const thread = await getActiveThread(prisma, integration)
  if (!thread) return safeSend(client, integration.telegramChatId, 'Start with a short idea first, then ask me to save it.', log)
  const currentPending = await prisma.telegramIdeaDraft.findFirst({ where: { threadId: thread.id, status: 'pending_confirmation', conversationRevision: thread.revision } })
  if (currentPending) return sendPreview(prisma, integration, currentPending, client, log)
  if (messageId || messageId === null) {
    await prisma.telegramIdeationMessage.create({ data: { threadId: thread.id, role: 'user', text, telegramMessageId: messageId } }).catch(() => {})
    await prisma.telegramIdeationThread.update({ where: { id: thread.id }, data: { revision: { increment: 1 } } })
  }
  const refreshed = await prisma.telegramIdeationThread.findUnique({ where: { id: thread.id } })
  if (!refreshed) return
  await prisma.telegramIdeaDraft.updateMany({ where: { threadId: thread.id, status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: new Date() } })
  const context = await buildContext(prisma, integration)
  const messages = await recentMessages(prisma, thread.id)
  const prompt = await activePrompt(prisma, M2_TELEGRAM_STRUCTURE_OPERATION)
  const model = await modelFor(prisma, config, integration.companyId, provider)
  const aiRequestId = randomUUID(); const startedAt = Date.now()
  await prisma.aiRequestLog.create({ data: aiLogData({ id: aiRequestId, companyId: integration.companyId, userId: integration.userId, promptVersionId: prompt.id, operation: M2_TELEGRAM_STRUCTURE_OPERATION, model, snapshot: { context, thread: messages } }) })
  let result
  try {
    result = await provider.generate({ model, outputSchemaVersion: M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION, systemPrompt: M2_TELEGRAM_STRUCTURE_SYSTEM_PROMPT, userPrompt: renderTelegramStructurePrompt({ ...context, thread: messages }), maxOutputTokens: config.telegramIdeationMaxOutputTokens ?? 800, timeoutMs: config.aiRequestTimeoutMs })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await failAi(prisma, aiRequestId, failure, Date.now() - startedAt, error)
    return safeSend(client, integration.telegramChatId, 'I could not structure that Idea right now. The conversation is still intact; please try /save again later.', log)
  }
  let draft: ReturnType<typeof parseStructureResult>
  try { draft = parseStructureResult(result.text, context.pillars) }
  catch (error) {
    const failure = error instanceof Error ? error : aiOutputInvalid()
    await failAi(prisma, aiRequestId, { code: 'AI_OUTPUT_INVALID', message: failure.message }, Date.now() - startedAt, null, result.providerRequestId)
    return safeSend(client, integration.telegramChatId, 'I could not structure that Idea response. The conversation is still intact; please try /save again later.', log)
  }
  await prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: { status: 'success', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: result.inputTokens, outputTokens: result.outputTokens, providerRequestId: result.providerRequestId } })
  const created = await prisma.telegramIdeaDraft.create({ data: { threadId: thread.id, companyId: integration.companyId, userId: integration.userId, productId: integration.activeProductId, title: draft.title, summary: draft.summary, targetAudience: draft.targetAudience, contentAngle: draft.contentAngle, contentPillarCode: draft.contentPillarCode, objective: draft.objective, conversationSummary: draft.conversationSummary, conversationRevision: refreshed.revision } })
  await sendPreview(prisma, integration, created, client, log)
}

async function confirmDraft(prisma: PrismaClient, integration: Integration, callbackTokenId: string, draftId: string, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "telegram_idea_drafts" WHERE "id" = CAST(${draftId} AS UUID) FOR UPDATE`
    const draft = await tx.telegramIdeaDraft.findFirst({ where: { id: draftId, companyId: integration.companyId, userId: integration.userId, thread: { integrationId: integration.id } } })
    if (!draft) throw notFound()
    if (draft.status === 'saved' && draft.ideaId) return { alreadySaved: true, title: draft.title }
    if (draft.status !== 'pending_confirmation') return { stale: true, title: draft.title }
    const thread = await tx.telegramIdeationThread.findUnique({ where: { id: draft.threadId } })
    if (!thread || thread.status !== 'active' || thread.revision !== draft.conversationRevision || draft.productId !== integration.activeProductId) {
      await tx.telegramIdeaDraft.update({ where: { id: draft.id }, data: { status: 'expired', cancelledAt: new Date() } })
      await tx.telegramCallbackToken.update({ where: { id: callbackTokenId }, data: { usedAt: new Date() } })
      return { stale: true, title: draft.title }
    }
    const pillar = draft.contentPillarCode ? await tx.contentPillar.findFirst({ where: { code: draft.contentPillarCode, active: true } }) : null
    if (!pillar) throw aiOutputInvalid('The saved Idea draft did not contain an approved Content Pillar.')
    if (draft.productId) {
      const product = await tx.product.findFirst({ where: { id: draft.productId, companyId: integration.companyId } })
      if (!product) throw forbidden('The selected Product is not owned by this Company.')
    }
    const idea = await createIdeaInTransaction(tx, integration.companyId, integration.userId, { title: draft.title, contextType: draft.productId ? 'product' : 'company', productId: draft.productId, pillarCode: pillar.code, objective: draft.objective as 'awareness' | 'education' | 'engagement' | 'credibility' | 'consideration' | 'discovery', targetAudience: draft.targetAudience, notes: `${draft.summary}\n\nContent angle: ${draft.contentAngle}`, sourceType: 'telegram_ideation', sourceReference: thread.id, sourceSummary: draft.conversationSummary })
    await tx.telegramIdeaDraft.update({ where: { id: draft.id }, data: { status: 'saved', ideaId: idea.id, confirmedAt: new Date() } })
    await tx.telegramIdeationThread.update({ where: { id: thread.id }, data: { status: 'saved', closedAt: new Date() } })
    await tx.telegramCallbackToken.update({ where: { id: callbackTokenId }, data: { usedAt: new Date() } })
    return { saved: true, title: draft.title, productName: draft.productId ? (await tx.product.findUnique({ where: { id: draft.productId }, select: { name: true } }))?.name ?? null : null, pillar: pillar.label }
  })
  if ('alreadySaved' in result && result.alreadySaved) return safeSend(client, integration.telegramChatId, 'This idea has already been saved.', log)
  if ('stale' in result && result.stale) return safeSend(client, integration.telegramChatId, 'This Idea preview is stale. Continue the current conversation and use /save again.', log)
  return safeSend(client, integration.telegramChatId, `Idea saved to Shifd Marketing.\n\nTitle: ${result.title}\nContext: ${result.productName ?? 'Company-level'}\nContent Pillar: ${result.pillar}`, log)
}

async function sendPreview(prisma: PrismaClient, integration: Integration, draft: Draft, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const save = await callbackToken(prisma, integration.id, 'save_draft', draft.id)
  const cancel = await callbackToken(prisma, integration.id, 'cancel_draft', draft.id)
  const pillar = draft.contentPillarCode ? await prisma.contentPillar.findUnique({ where: { code: draft.contentPillarCode }, select: { label: true } }) : null
  const text = ['Idea Preview', '', `Title: ${draft.title}`, `Target Audience: ${draft.targetAudience}`, `Content Angle: ${draft.contentAngle}`, `Content Pillar: ${pillar?.label ?? '—'}`, `Summary: ${draft.summary}`].join('\n')
  return safeSend(client, integration.telegramChatId, text, log, { inline_keyboard: [[{ text: 'Save Idea', callback_data: `t:${save}` }, { text: 'Cancel', callback_data: `t:${cancel}` }]] })
}

async function showProducts(prisma: PrismaClient, integration: Integration, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  const products = await prisma.product.findMany({ where: { companyId: integration.companyId, status: { not: 'inactive' } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 20 })
  const buttons: TelegramInlineKeyboardButton[][] = []
  for (const product of products) buttons.push([{ text: product.name, callback_data: `t:${await callbackToken(prisma, integration.id, 'select_product', undefined, product.id)}` }])
  buttons.push([{ text: 'Company-level', callback_data: `t:${await callbackToken(prisma, integration.id, 'select_product')}` }])
  return safeSend(client, integration.telegramChatId, products.length ? 'Choose the active Product context:' : 'No active Products are available. Use /company for Company-level ideation.', log, products.length ? { inline_keyboard: buttons } : undefined)
}

async function switchContext(prisma: PrismaClient, integration: Integration, productId: string | null, client: TelegramClient, log: (message: string, details?: unknown) => void, callbackTokenId?: string) {
  const product = productId ? await prisma.product.findFirst({ where: { id: productId, companyId: integration.companyId, status: { not: 'inactive' } }, select: { id: true, name: true } }) : null
  if (productId && !product) return safeSend(client, integration.telegramChatId, 'That Product is not available in your Company.', log)
  await prisma.$transaction(async (tx) => {
    const current = await tx.telegramIntegration.findFirst({ where: { id: integration.id, companyId: integration.companyId, userId: integration.userId, status: 'active' } })
    if (!current) throw forbidden()
    await tx.telegramIdeationThread.updateMany({ where: { integrationId: integration.id, status: 'active' }, data: { status: 'abandoned', closedAt: new Date() } })
    await tx.telegramIdeaDraft.updateMany({ where: { companyId: integration.companyId, userId: integration.userId, status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: new Date() } })
    await tx.telegramIntegration.update({ where: { id: integration.id }, data: { activeProductId: product?.id ?? null } })
    await tx.telegramIdeationThread.create({ data: { integrationId: integration.id, companyId: integration.companyId, userId: integration.userId, productId: product?.id ?? null } })
    if (callbackTokenId) await tx.telegramCallbackToken.update({ where: { id: callbackTokenId }, data: { usedAt: new Date() } })
  })
  return safeSend(client, integration.telegramChatId, `Active context: ${integration.companyName} → ${product?.name ?? 'Company-level'}`, log)
}

async function newThread(prisma: PrismaClient, integration: Integration, client: TelegramClient, log: (message: string, details?: unknown) => void) {
  await prisma.$transaction(async (tx) => {
    await tx.telegramIdeationThread.updateMany({ where: { integrationId: integration.id, status: 'active' }, data: { status: 'abandoned', closedAt: new Date() } })
    await tx.telegramIdeaDraft.updateMany({ where: { companyId: integration.companyId, userId: integration.userId, status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: new Date() } })
    await tx.telegramIdeationThread.create({ data: { integrationId: integration.id, companyId: integration.companyId, userId: integration.userId, productId: integration.activeProductId } })
  })
  return safeSend(client, integration.telegramChatId, 'Started a new ideation thread. What would you like to explore?', log)
}

async function cancelDraft(prisma: PrismaClient, integration: Integration, client: TelegramClient, log: (message: string, details?: unknown) => void, callbackTokenId?: string, draftId?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.telegramIdeaDraft.updateMany({ where: { ...(draftId ? { id: draftId } : { companyId: integration.companyId, userId: integration.userId, status: 'pending_confirmation' }), status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: new Date() } })
    if (callbackTokenId) await tx.telegramCallbackToken.update({ where: { id: callbackTokenId }, data: { usedAt: new Date() } })
  })
  return safeSend(client, integration.telegramChatId, 'Save cancelled. The ideation conversation remains available.', log)
}

async function contextText(prisma: PrismaClient, integration: Integration) {
  const context = await buildContext(prisma, integration)
  return `Active context: ${context.company.name} → ${context.product ? context.product.name : 'Company-level'}`
}

function helpText() { return ['Send a message → brainstorm naturally', '/context → see active Company/Product', '/product → change Product', '/company → company-level ideation', '/new → start a new idea thread', '/save or “Save this idea” → prepare an Idea for confirmation', '/cancel → cancel pending save'].join('\n') }

async function buildContext(prisma: PrismaClient, integration: Integration) {
  const resolved = await readResolvedContextFromDb(prisma, integration.companyId, integration.activeProductId ?? undefined)
  const taxonomy = await readTaxonomy(prisma)
  return {
    company: { name: resolved.company.profile.name, description: resolved.company.profile.description, positioning: resolved.company.profile.positioning, valueProposition: resolved.company.profile.coreValueProposition, differentiators: resolved.company.profile.differentiators, customerSegments: resolved.company.profile.customerSegments, decisionMakers: resolved.company.profile.decisionMakers, painPoints: resolved.company.profile.painPoints, brandVoice: resolved.resolvedBrand.brandVoice, preferredLanguage: resolved.resolvedBrand.preferredLanguage },
    product: resolved.product ? { name: resolved.product.name, description: resolved.product.description, category: resolved.product.category, targetUsers: resolved.product.profile.targetUsers, targetOrganizations: resolved.product.profile.targetOrganizations, decisionMakers: resolved.product.profile.decisionMakers, problemsAddressed: resolved.product.profile.problemsAddressed, valueProposition: resolved.product.profile.valueProposition, positioning: resolved.product.profile.positioning, keyMessages: resolved.product.profile.keyMessages } : null,
    pillars: taxonomy.pillars,
  }
}

async function activePrompt(prisma: PrismaClient, operation: string) {
  const prompt = await prisma.promptVersion.findFirst({ where: { module: 'M2', operation, status: 'active' } })
  if (!prompt) throw aiNotConfigured()
  return prompt
}

async function modelFor(prisma: PrismaClient, config: AppConfig, companyId: string, provider: AiProvider) {
  const settings = await prisma.aiSettings.findUnique({ where: { companyId }, select: { modelId: true } })
  const model = settings?.modelId ?? config.openaiModel ?? AI_MODEL_ID
  if (provider.isConfigured && !provider.isConfigured(model)) throw aiNotConfigured()
  return model
}

async function prepareThreadMessage(prisma: PrismaClient, integration: Integration, messageId: string | null, text: string) {
  const thread = await getOrCreateThread(prisma, integration)
  await prisma.telegramIdeaDraft.updateMany({ where: { threadId: thread.id, status: 'pending_confirmation' }, data: { status: 'cancelled', cancelledAt: new Date() } })
  await prisma.telegramIdeationMessage.create({ data: { threadId: thread.id, role: 'user', telegramMessageId: messageId, text } }).catch(() => {})
  await prisma.telegramIdeationThread.update({ where: { id: thread.id }, data: { revision: { increment: 1 } } })
  return { threadId: thread.id, history: await recentMessages(prisma, thread.id) }
}

async function getOrCreateThread(prisma: PrismaClient, integration: Integration) {
  const existing = await getActiveThread(prisma, integration)
  if (existing) return existing
  return prisma.telegramIdeationThread.create({ data: { integrationId: integration.id, companyId: integration.companyId, userId: integration.userId, productId: integration.activeProductId } })
}

function getActiveThread(prisma: PrismaClient, integration: Integration) { return prisma.telegramIdeationThread.findFirst({ where: { integrationId: integration.id, companyId: integration.companyId, userId: integration.userId, status: 'active' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }) }
async function recentMessages(prisma: PrismaClient, threadId: string) { const rows = await prisma.telegramIdeationMessage.findMany({ where: { threadId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: HISTORY_LIMIT, select: { role: true, text: true } }); return rows.reverse() }

async function activeIntegration(prisma: PrismaClient, telegramUserId: string, telegramChatId: string) {
  const row = await prisma.telegramIntegration.findFirst({ where: { telegramUserId, telegramChatId, status: 'active' }, include: { company: { select: { name: true } } } })
  return row ? { ...row, companyName: row.company.name } : null
}

async function claimUpdate(prisma: PrismaClient, updateId: number) { try { await prisma.telegramWebhookUpdate.create({ data: { updateId: BigInt(updateId) } }); return true } catch (error) { if (isUnique(error)) return false; throw error } }
async function markCallbackUsed(prisma: PrismaClient, id: string) { await prisma.telegramCallbackToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } }) }
async function callbackToken(prisma: PrismaClient, integrationId: string, action: 'save_draft' | 'cancel_draft' | 'select_product', draftId?: string, productId?: string) { const raw = randomBytes(18).toString('base64url'); await prisma.telegramCallbackToken.create({ data: { integrationId, action, draftId: draftId ?? null, productId: productId ?? null, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + CALLBACK_TTL_MINUTES * 60_000) } }); return raw }
function hashToken(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex') }
function stringId(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' && /^\d+$/.test(value) ? value : null }
function isCommand(text: string, command: string) { return text.toLowerCase() === command || text.toLowerCase().startsWith(`${command}@`) }
export function explicitSavePhrase(text: string) { return ['save this idea', 'simpan ide ini'].includes(text.toLocaleLowerCase().replace(/[.!?]+$/u, '').trim()) }
export function parseUpdate(value: unknown): TelegramUpdate & { update_id: number } { if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('Telegram Update is invalid.'); const update = value as TelegramUpdate; if (typeof update.update_id !== 'number' || !Number.isSafeInteger(update.update_id) || (!update.message && !update.callback_query)) throw badRequest('Telegram Update is invalid.'); return update as TelegramUpdate & { update_id: number } }
function parseChatResult(text: string) { try { const value = JSON.parse(text) as { reply?: unknown }; if (typeof value.reply !== 'string' || !value.reply.trim()) throw new Error(); return { reply: value.reply.trim() } } catch { throw aiOutputInvalid() } }
function parseStructureResult(text: string, pillars: Array<{ code: string; label: string }>) { try { const value = JSON.parse(text) as Record<string, unknown>; const strings = ['title', 'summary', 'targetAudience', 'contentAngle', 'contentPillarCode', 'objective', 'conversationSummary']; if (strings.some((key) => typeof value[key] !== 'string' || !(value[key] as string).trim())) throw new Error(); if (!pillars.some((pillar) => pillar.code === value.contentPillarCode)) throw new Error(); if (!['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'].includes(value.objective as string)) throw new Error(); return { title: value.title as string, summary: value.summary as string, targetAudience: value.targetAudience as string, contentAngle: value.contentAngle as string, contentPillarCode: value.contentPillarCode as string, objective: value.objective as string, conversationSummary: value.conversationSummary as string } } catch { throw aiOutputInvalid() } }
async function failAi(prisma: PrismaClient, aiRequestId: string, failure: { code: string; message: string }, latencyMs: number, providerError: unknown, providerRequestId?: string | null) { await prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: { status: 'failed', errorCode: failure.code, errorMessage: failure.message, latencyMs, providerRequestId: providerRequestId ?? (providerError instanceof Error && 'providerRequestId' in providerError ? String(providerError.providerRequestId) : null), completedAt: new Date() } }) }
function aiLogData(input: { id: string; companyId: string; userId: string; promptVersionId: string; operation: string; model: string; snapshot: unknown }): Prisma.AiRequestLogCreateInput { return { id: input.id, company: { connect: { id: input.companyId } }, requester: { connect: { id: input.userId } }, promptVersion: { connect: { id: input.promptVersionId } }, module: 'M2', operation: input.operation, provider: AI_PROVIDER, model: input.model, mode: 'real', language: 'English', inputHash: createHash('sha256').update(JSON.stringify(input.snapshot)).digest('hex'), inputSnapshot: input.snapshot as Prisma.InputJsonValue, status: 'pending' } }
async function safeSend(client: TelegramClient, chatId: string, text: string, log: (message: string, details?: unknown) => void, replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] }) { try { await client.sendMessage(chatId, text, replyMarkup) } catch (error) { log('Telegram message delivery failed.', error) } }
function isUnique(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' }
type Integration = Awaited<ReturnType<typeof activeIntegration>> & { companyName: string }
type Draft = { id: string; title: string; summary: string; targetAudience: string; contentAngle: string; contentPillarCode: string | null }
