import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'

const config = loadConfig()
const app = await buildApp({ config })
let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'Shutting down')
  try {
    await app.close()
    process.exitCode = 0
  } catch (error) {
    app.log.error({ err: error }, 'Shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ port: config.port, host: config.host })
} catch (error) {
  app.log.error({ err: error }, 'Server failed to start')
  await app.close()
  process.exitCode = 1
}
