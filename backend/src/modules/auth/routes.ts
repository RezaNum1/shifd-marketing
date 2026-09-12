import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { invalidCredentials, validationError } from '../../shared/errors/AppError.js'
import { verifyPassword } from './password.js'
import { createSession, rotateCsrfToken, SESSION_COOKIE, sessionCookieOptions } from './session.js'
import { requireAuth, requireCsrf, validateOrigin } from './protection.js'

interface LoginBody { email?: unknown; password?: unknown }

function userProjection(user: { id: string; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

function parseLogin(body: LoginBody): { email: string; password: string } {
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.trim() || !body.password) throw validationError('Email and password are required.', { email: 'Email is required.', password: 'Password is required.' })
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError('Enter a valid email address.', { email: 'Enter a valid email address.' })
  return { email, password: body.password }
}

export async function authRoutes(app: FastifyInstance, options: { config: AppConfig }) {
  app.post<{ Body: LoginBody }>('/auth/login', {
    config: { rateLimit: { max: options.config.loginRateLimitMax, timeWindow: options.config.loginRateLimitWindowMinutes * 60 * 1000 } },
  }, async (request, reply) => {
    validateOrigin(request, options.config)
    const { email, password } = parseLogin(request.body ?? {})
    const user = await app.prisma.user.findFirst({ where: { email }, include: { company: true } })
    if (!user || !user.active || !(await verifyPassword(user.passwordHash, password))) throw invalidCredentials()
    const created = await createSession(app.prisma, user.id, options.config)
    reply.setCookie(SESSION_COOKIE, created.token, sessionCookieOptions(options.config))
    return reply.send({ data: { user: userProjection(user), csrfToken: created.csrfToken, expiresAt: created.session.expiresAt.toISOString() } })
  })

  app.get('/auth/me', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const csrfToken = await rotateCsrfToken(app.prisma, auth.session.id)
    return reply.send({ data: { user: userProjection(auth.user), csrfToken, expiresAt: auth.session.expiresAt.toISOString() } })
  })

  app.post('/auth/logout', async (request, reply) => {
    validateOrigin(request, options.config)
    if (!request.cookies[SESSION_COOKIE]) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return reply.status(204).send()
    }
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    await app.prisma.authSession.update({ where: { id: auth.session.id }, data: { revokedAt: new Date() } })
    reply.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(options.config), expires: new Date(0) })
    return reply.status(204).send()
  })
}
