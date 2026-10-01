import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import { processTelegramUpdate } from '../src/modules/integrations/telegram/service.js'
import type { AiProvider, AiProviderRequest, AiProviderResult } from '../src/modules/ai/provider.js'
import type { TelegramClient, TelegramInlineKeyboardButton } from '../src/modules/integrations/telegram/client.js'
import { M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION } from '../src/modules/ai/constants.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for Telegram database tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const config: AppConfig = { ...loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: testDatabaseUrl, ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173', LOGIN_RATE_LIMIT_MAX: '1000', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'test_bot', TELEGRAM_WEBHOOK_SECRET: 'test-secret', TELEGRAM_PUBLIC_WEBHOOK_URL: 'https://example.test/api/integrations/telegram/webhook' }) }
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })

class FakeTelegram implements TelegramClient {
  messages: Array<{ chatId: string; text: string; replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] } }> = []
  async sendMessage(chatId: string, text: string, replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] }) { this.messages.push({ chatId, text, ...(replyMarkup ? { replyMarkup } : {}) }) }
  async answerCallbackQuery() {}
  async setWebhook() {}
  async getWebhookInfo() { return { ok: true } }
  async deleteWebhook() {}
}

class FakeAi implements AiProvider {
  calls = 0
  isConfigured() { return true }
  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1
    const text = request.outputSchemaVersion === M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION
      ? JSON.stringify({ reply: 'Who is the audience and what problem should this idea clarify?' })
      : JSON.stringify({ title: 'Routine letters without physical signatures', summary: 'A problem-led idea about removing avoidable signature friction.', targetAudience: 'Operations and administrative teams', contentAngle: 'Start with the cost of waiting for routine approvals, not the product.', contentPillarCode: 'problem', objective: 'education', conversationSummary: 'Founder refined a problem-led, non-promotional angle for routine internal letters.' })
    return { text, inputTokens: 10, outputTokens: 20, providerRequestId: `fake-${this.calls}` }
  }
}

async function cleanupTelegramTestData(companyId: string, userId: string) {
  await prisma.telegramCallbackToken.deleteMany({ where: { integration: { companyId } } })
  await prisma.telegramIdeationMessage.deleteMany({ where: { thread: { companyId } } })
  await prisma.telegramIdeaDraft.deleteMany({ where: { companyId } })
  await prisma.telegramIdeationThread.deleteMany({ where: { companyId } })
  await prisma.telegramIntegration.deleteMany({ where: { companyId } })
  await prisma.telegramLinkToken.deleteMany({ where: { companyId } })
  await prisma.telegramWebhookUpdate.deleteMany({ where: { updateId: { in: [1001n, 1002n, 1003n, 1004n, 1005n] } } })

  // ContentIdea.createdBy and the TelegramIdeaDraft.ideaId FK both require the
  // canonical Idea to be removed before its owner can be removed.
  await prisma.topicCandidate.deleteMany({ where: { companyId } })
  await prisma.contentIdea.deleteMany({ where: { companyId } })

  // Request idempotency rows point at AI logs, while Telegram messages point
  // at those logs. Both must be gone before removing the test user/company.
  await prisma.requestIdempotency.deleteMany({ where: { companyId } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId } })
  await prisma.authSession.deleteMany({ where: { userId } })

  // bootstrapOperator provisions these company-owned records.
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId } } })
  await prisma.publicationMetric.deleteMany({ where: { socialAccount: { companyId } } })
  await prisma.socialAccount.deleteMany({ where: { companyId } })
  await prisma.aiSettings.deleteMany({ where: { companyId } })
  await prisma.bmcBlock.deleteMany({ where: { companyId } })
  await prisma.brandProfile.deleteMany({ where: { companyId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.company.delete({ where: { id: companyId } })
}

runIntegration('Telegram conversational ideation', () => {
  const client = new FakeTelegram()
  const provider = new FakeAi()
  let companyId = ''
  let userId = ''
  let rawLinkToken = ''
  const telegramUserId = '987654321'
  const telegramChatId = '987654321'

  beforeAll(async () => {
    await prisma.$connect()
    await seedM2Prompt(prisma)
    const created = await bootstrapOperator(prisma, { companyName: 'Telegram Test Company', companyDescription: 'A company for Telegram ideation tests.', userName: 'Telegram Founder', userEmail: `telegram-${Date.now()}@example.test`, userPassword: 'correct-password' })
    if (!created.created) throw new Error('Telegram test bootstrap unexpectedly reused a user.')
    companyId = created.company.id
    userId = created.user.id
    rawLinkToken = randomBytes(32).toString('base64url')
    await prisma.telegramLinkToken.create({ data: { companyId, userId, tokenHash: createHash('sha256').update(rawLinkToken).digest('hex'), expiresAt: new Date(Date.now() + 600_000) } })
  })

  afterAll(async () => {
    if (!companyId) { await prisma.$disconnect(); return }
    await cleanupTelegramTestData(companyId, userId)
    await prisma.$disconnect()
  })

  it('links a private identity, bounds duplicate updates, and saves exactly one canonical Idea after confirmation', async () => {
    await processTelegramUpdate(prisma, config, provider, { update_id: 1001, message: { message_id: 1, chat: { id: Number(telegramChatId), type: 'private' }, from: { id: Number(telegramUserId) }, text: `/start ${rawLinkToken}` } }, client)
    const integration = await prisma.telegramIntegration.findUnique({ where: { telegramUserId } })
    expect(integration).toMatchObject({ companyId, userId, telegramChatId, status: 'active' })

    await processTelegramUpdate(prisma, config, provider, { update_id: 1002, message: { message_id: 2, chat: { id: Number(telegramChatId), type: 'private' }, from: { id: Number(telegramUserId) }, text: 'I want a problem-led idea about physical signatures.' } }, client)
    expect(provider.calls).toBe(1)
    await processTelegramUpdate(prisma, config, provider, { update_id: 1002, message: { message_id: 2, chat: { id: Number(telegramChatId), type: 'private' }, from: { id: Number(telegramUserId) }, text: 'I want a problem-led idea about physical signatures.' } }, client)
    expect(provider.calls).toBe(1)

    await processTelegramUpdate(prisma, config, provider, { update_id: 1003, message: { message_id: 3, chat: { id: Number(telegramChatId), type: 'private' }, from: { id: Number(telegramUserId) }, text: 'Save this idea' } }, client)
    expect(provider.calls).toBe(2)
    expect(await prisma.contentIdea.count({ where: { companyId } })).toBe(0)
    const preview = client.messages.at(-1)
    const saveData = preview?.replyMarkup?.inline_keyboard.flat().find((button) => button.text === 'Save Idea')?.callback_data
    expect(saveData).toBeTruthy()

    await processTelegramUpdate(prisma, config, provider, { update_id: 1004, callback_query: { id: 'callback-1', from: { id: Number(telegramUserId) }, message: { message_id: 4, chat: { id: Number(telegramChatId), type: 'private' } }, data: saveData } }, client)
    const ideas = await prisma.contentIdea.findMany({ where: { companyId } })
    expect(ideas).toHaveLength(1)
    expect(ideas[0]).toMatchObject({ sourceType: 'telegram_ideation', pillarCode: 'problem', sourceSummary: expect.stringContaining('Founder refined') })
    expect(await prisma.content.count({ where: { companyId } })).toBe(0)
    await processTelegramUpdate(prisma, config, provider, { update_id: 1005, callback_query: { id: 'callback-2', from: { id: Number(telegramUserId) }, message: { message_id: 5, chat: { id: Number(telegramChatId), type: 'private' } }, data: saveData } }, client)
    expect(await prisma.contentIdea.count({ where: { companyId } })).toBe(1)
  })
})
