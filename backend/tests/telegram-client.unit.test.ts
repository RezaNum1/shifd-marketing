import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramApiClient } from '../src/modules/integrations/telegram/client.js'

const config = {
  telegramBotToken: 'test-token',
  telegramPublicWebhookUrl: 'https://example.test/api/integrations/telegram/webhook',
  telegramWebhookSecret: 'test-secret',
}

describe('TelegramApiClient', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the successful Telegram result from getWebhookInfo', async () => {
    const webhookInfo = { url: 'https://example.test/webhook', pending_update_count: 0 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, result: webhookInfo }), { status: 200 }))

    await expect(new TelegramApiClient(config).getWebhookInfo()).resolves.toEqual(webhookInfo)
  })

  it('preserves Telegram API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 }))

    await expect(new TelegramApiClient(config).getWebhookInfo()).rejects.toThrow('Unauthorized')
  })
})
