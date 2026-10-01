import { loadConfig } from '../../../config/env.js'
import { TelegramApiClient } from './client.js'

const config = loadConfig()
const client = new TelegramApiClient(config)
const command = process.argv[2]

if (!['set', 'info', 'delete'].includes(command ?? '')) {
  console.error('Usage: npm run telegram:webhook -- <set|info|delete>')
  process.exitCode = 1
} else {
  try {
    if (command === 'set') { await client.setWebhook(); console.log('Telegram webhook configured.') }
    if (command === 'info') { const info = await client.getWebhookInfo(); console.log(JSON.stringify(info, null, 2)) }
    if (command === 'delete') { await client.deleteWebhook(); console.log('Telegram webhook deleted.') }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Telegram webhook command failed.')
    process.exitCode = 1
  }
}
