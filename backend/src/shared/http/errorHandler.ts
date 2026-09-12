import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/AppError.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
    requestId: string
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const appError = error instanceof AppError ? error : undefined
    const statusCode = appError?.statusCode ?? (error.statusCode && error.statusCode >= 400 ? error.statusCode : 500)
    const body: ErrorBody = {
      error: {
        code: appError?.code ?? (statusCode === 404 ? 'NOT_FOUND' : statusCode === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR'),
        message: appError?.message ?? (statusCode === 404 ? 'The requested route was not found.' : statusCode === 429 ? 'Too many requests.' : 'An unexpected error occurred.'),
        ...(appError?.fields ? { fields: appError.fields } : {}),
        requestId: request.id,
      },
    }
    if (statusCode >= 500) request.log.error({ err: error }, 'Unhandled request error')
    else request.log.warn({ code: body.error.code }, 'Request rejected')
    return reply.status(statusCode).send(body)
  })
}
