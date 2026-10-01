import type { AppConfig } from '../../../config/env.js'

export interface TelegramInlineKeyboardButton { text: string; callback_data: string }
export interface TelegramClient {
  sendMessage(chatId: string, text: string, replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] }): Promise<void>
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>
  setWebhook(): Promise<void>
  getWebhookInfo(): Promise<unknown>
  deleteWebhook(): Promise<void>
}

export class TelegramApiClient implements TelegramClient {
  constructor(private readonly config: Pick<AppConfig, 'telegramBotToken' | 'telegramPublicWebhookUrl' | 'telegramWebhookSecret'>) {}

  async sendMessage(chatId: string, text: string, replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] }) {
    await this.call('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    await this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
  }

  async setWebhook() {
    if (!this.config.telegramPublicWebhookUrl || !this.config.telegramWebhookSecret) throw new Error('Telegram webhook configuration is incomplete.')
    await this.call('setWebhook', { url: this.config.telegramPublicWebhookUrl, secret_token: this.config.telegramWebhookSecret, allowed_updates: ['message', 'callback_query'], max_connections: 1 })
  }

  getWebhookInfo() { return this.call('getWebhookInfo', {}) }
  async deleteWebhook() { await this.call('deleteWebhook', {}) }

  private async call(method: string, body: Record<string, unknown>) {
    const token = this.config.telegramBotToken
    if (!token) throw new Error('Telegram bot is not configured.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      })
      const payload = await response.json() as { ok?: boolean; result?: unknown; description?: string }
      if (!response.ok || payload.ok !== true) throw new Error(payload.description || `Telegram ${method} failed.`)
      return payload.result
    } finally { clearTimeout(timeout) }
  }
}
