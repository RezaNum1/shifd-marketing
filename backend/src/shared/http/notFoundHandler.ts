import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors/AppError.js'

export function registerNotFoundHandler(app: FastifyInstance) {
  app.setNotFoundHandler((_request, _reply) => {
    throw notFound('The requested route was not found.')
  })
}
