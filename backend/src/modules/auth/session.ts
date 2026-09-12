import type { PrismaClient, User, AuthSession } from '@prisma/client'
import type { AppConfig } from '../../config/env.js'
import { createOpaqueToken, hashToken, tokensMatch } from './crypto.js'

export const SESSION_COOKIE = 'shifd_session'

export interface AuthIdentity {
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'companyId'>
  session: AuthSession
}

export interface SessionInfo {
  user: Pick<User, 'id' | 'name' | 'email' | 'role'>
  csrfToken: string
  expiresAt: string
}

export function sessionCookieOptions(config: AppConfig) {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: config.nodeEnv === 'production' }
}

export async function createSession(prisma: PrismaClient, userId: string, config: AppConfig, now = new Date()) {
  const token = createOpaqueToken()
  const csrfToken = createOpaqueToken()
  const absoluteExpiresAt = new Date(now.getTime() + config.sessionAbsoluteHours * 60 * 60 * 1000)
  const expiresAt = new Date(Math.min(now.getTime() + config.sessionIdleMinutes * 60 * 1000, absoluteExpiresAt.getTime()))
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfSecretHash: hashToken(csrfToken),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      absoluteExpiresAt,
    },
    include: { user: true },
  })
  return { token, csrfToken, session }
}

export async function findValidSession(prisma: PrismaClient, rawToken: string, config: AppConfig, now = new Date()): Promise<AuthIdentity | null> {
  const tokenHash = hashToken(rawToken)
  const session = await prisma.authSession.findUnique({ where: { tokenHash }, include: { user: true } })
  if (!session || !tokensMatch(rawToken, session.tokenHash) || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now || !session.user.active) return null
  const refreshedExpiresAt = new Date(Math.min(now.getTime() + config.sessionIdleMinutes * 60 * 1000, session.absoluteExpiresAt.getTime()))
  const refreshed = await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt: refreshedExpiresAt }, include: { user: true } })
  return { user: refreshed.user, session: refreshed }
}

export async function rotateCsrfToken(prisma: PrismaClient, sessionId: string, now = new Date()) {
  const csrfToken = createOpaqueToken()
  await prisma.authSession.update({ where: { id: sessionId }, data: { csrfSecretHash: hashToken(csrfToken), lastSeenAt: now } })
  return csrfToken
}

export async function verifyCsrfToken(rawToken: string | undefined, storedHash: string): Promise<boolean> {
  return Boolean(rawToken && tokensMatch(rawToken, storedHash))
}
