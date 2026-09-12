import fp from 'fastify-plugin'
import type { AppConfig } from '../../config/env.js'
import { loadAuth } from './protection.js'

export default fp(async (app, options: { config: AppConfig }) => {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (request) => {
    await loadAuth(request, options.config)
  })
})
