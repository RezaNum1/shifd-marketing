import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { csrfInvalid, forbidden, unauthenticated } from '../../shared/errors/AppError.js'
import { findValidSession, SESSION_COOKIE, verifyCsrfToken, type AuthIdentity } from './session.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthIdentity | null
  }
}

export function validateOrigin(request: FastifyRequest, config: AppConfig) {
  if (request.headers.origin !== config.allowedOrigin) throw forbidden()
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    throw unauthenticated()
  }
  return request.auth
}

export async function loadAuth(request: FastifyRequest, config: AppConfig) {
  const rawToken = request.cookies[SESSION_COOKIE]
  request.auth = rawToken ? await findValidSession(request.server.prisma, rawToken, config) : null
}

export async function requireCsrf(request: FastifyRequest) {
  const header = request.headers['x-csrf-token']
  const token = Array.isArray(header) ? header[0] : header
  if (!request.auth || !(await verifyCsrfToken(token, request.auth.session.csrfSecretHash))) throw csrfInvalid()
}
