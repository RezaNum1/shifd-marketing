import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/AppError.js'

type RuntimeEnvironment = 'development' | 'test' | 'production'
type ProviderDiagnosticsError = AppError & { providerDiagnostics?: Record<string, unknown> }

interface ErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
    requestId: string
  }
}

export function registerErrorHandler(app: FastifyInstance, nodeEnv: RuntimeEnvironment = 'production') {
  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const appError = error instanceof AppError ? error : undefined
    const statusCode = appError?.statusCode ?? (error.statusCode && error.statusCode >= 400 ? error.statusCode : 500)
    const body: ErrorBody = {
      error: {
        code: appError?.code ?? (statusCode === 404 ? 'NOT_FOUND' : statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : statusCode === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : statusCode === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR'),
        message: appError?.message ?? (statusCode === 404 ? 'The requested route was not found.' : statusCode === 413 ? 'The uploaded file is too large.' : statusCode === 415 ? 'The uploaded media type is not supported.' : statusCode === 429 ? 'Too many requests.' : 'An unexpected error occurred.'),
        ...(appError?.fields ? { fields: appError.fields } : {}),
        requestId: request.id,
      },
    }
    if (statusCode >= 500) {
      const providerDiagnostics = nodeEnv === 'development' && appError ? (appError as ProviderDiagnosticsError).providerDiagnostics : undefined
      request.log.error({ err: error, ...(providerDiagnostics ? { openai: providerDiagnostics } : {}) }, providerDiagnostics ? 'OpenAI API request failed' : 'Unhandled request error')
    }
    else request.log.warn({ code: body.error.code }, 'Request rejected')
    return reply.status(statusCode).send(body)
  })
}
