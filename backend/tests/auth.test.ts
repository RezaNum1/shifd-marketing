import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { hashToken } from '../src/modules/auth/crypto.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = {
  ...loadConfig({
    NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1',
    DATABASE_URL: process.env.DATABASE_URL,
    ALLOWED_ORIGIN: origin,
  }),
  loginRateLimitMax: 5,
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const email = `phase2-${Date.now()}@example.test`
let companyId = ''
let userId = ''

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

runIntegration('Phase 2 authentication', () => {
  beforeAll(async () => {
    await prisma.$connect()
    const result = await bootstrapOperator(prisma, {
      companyName: 'Phase 2 Test Company', companyDescription: 'Integration test company',
      userName: 'Test Founder', userEmail: email, userPassword: 'correct-password',
    })
    if (!result.created) throw new Error('Test user unexpectedly already exists.')
    companyId = result.company.id
    userId = result.user.id
  })

  afterAll(async () => {
    await prisma.authSession.deleteMany({ where: { userId } })
    if (userId) await prisma.user.delete({ where: { id: userId } })
    if (companyId) {
      await prisma.requestIdempotency.deleteMany({ where: { companyId } })
      await prisma.aiRequestLog.deleteMany({ where: { companyId } })
      await prisma.productProfile.deleteMany({ where: { product: { companyId } } })
      await prisma.product.deleteMany({ where: { companyId } })
      await prisma.bmcBlock.deleteMany({ where: { companyId } })
      await prisma.brandProfile.deleteMany({ where: { companyId } })
      await prisma.aiSettings.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.$disconnect()
  })

  it('bootstraps an Argon2id hash and refuses duplicate email creation', async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user?.passwordHash).not.toBe('correct-password')
    const duplicate = await bootstrapOperator(prisma, {
      companyName: 'Duplicate', companyDescription: 'Duplicate', userName: 'Duplicate', userEmail: email, userPassword: 'another-password',
    })
    expect(duplicate.created).toBe(false)
    expect(await prisma.user.count({ where: { email } })).toBe(1)
  })

  it('authenticates, returns CSRF, supports me, and logs out only the current session', async () => {
    const app = await buildApp({ config, logger: false })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    expect(login.statusCode).toBe(200)
    expect(login.headers['set-cookie']).toBeDefined()
    const body = login.json<{ data: { csrfToken: string; user: { email: string }; expiresAt: string } }>()
    expect(body.data.user.email).toBe(email)
    expect(body.data.csrfToken).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain('correct-password')
    const cookie = cookieFrom(login)
    expect(await prisma.authSession.count({ where: { userId } })).toBe(1)
    const storedSession = await prisma.authSession.findFirst({ where: { userId } })
    expect(storedSession?.tokenHash).toHaveLength(64)
    expect(storedSession?.tokenHash).not.toBe(cookie.split('=')[1])
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    const meBody = me.json<{ data: { csrfToken: string } }>()
    expect(meBody.data.csrfToken).not.toBe(body.data.csrfToken)
    const noCsrf = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin, cookie } })
    expect(noCsrf.statusCode).toBe(403)
    const wrongCsrf = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin, cookie, 'x-csrf-token': 'invalid' } })
    expect(wrongCsrf.statusCode).toBe(403)
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin, cookie, 'x-csrf-token': meBody.data.csrfToken } })
    expect(logout.statusCode).toBe(204)
    expect((await prisma.authSession.findFirst({ where: { userId } }))?.revokedAt).not.toBeNull()
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1)
    expect(await prisma.company.count({ where: { id: companyId } })).toBe(1)
    await app.close()
  })

  it('uses generic invalid credentials and rejects inactive users and invalid origins', async () => {
    const app = await buildApp({ config, logger: false })
    const wrongEmail = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: 'missing@example.test', password: 'wrong' } })
    const wrongPassword = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'wrong' } })
    expect(wrongEmail.statusCode).toBe(401)
    expect(wrongEmail.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
    expect(wrongPassword.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
    await prisma.user.update({ where: { id: userId }, data: { active: false } })
    const inactive = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    expect(inactive.statusCode).toBe(401)
    await prisma.user.update({ where: { id: userId }, data: { active: true } })
    const invalidOrigin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://invalid.example' }, payload: { email, password: 'correct-password' } })
    expect(invalidOrigin.statusCode).toBe(403)
    const validLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://invalid.example', cookie: cookieFrom(validLogin) } })).statusCode).toBe(403)
    await app.close()
  })

  it('rate limits excessive login requests', async () => {
    const app = await buildApp({ config, logger: false })
    const responses = []
    for (let i = 0; i < 6; i += 1) responses.push(await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: 'rate@example.test', password: 'wrong' } }))
    expect(responses.at(-1)?.statusCode).toBe(429)
    await app.close()
  })

  it('validates session expiry and revoked sessions', async () => {
    const app = await buildApp({ config, logger: false })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    const cookie = cookieFrom(login)
    const token = cookie.split('=')[1]
    if (!token) throw new Error('Session cookie was not set.')
    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) } })
    expect(session).toBeTruthy()
    await prisma.authSession.update({ where: { id: session!.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(expired.statusCode).toBe(401)
    const absoluteLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    const absoluteCookie = cookieFrom(absoluteLogin)
    const absoluteToken = absoluteCookie.split('=')[1]
    if (!absoluteToken) throw new Error('Absolute-expiry session cookie was not set.')
    const absoluteSession = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(absoluteToken) } })
    await prisma.authSession.update({ where: { id: absoluteSession!.id }, data: { absoluteExpiresAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000) } })
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: absoluteCookie } })).statusCode).toBe(401)
    const revokedLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
    const revokedCookie = cookieFrom(revokedLogin)
    const revokedToken = revokedCookie.split('=')[1]
    if (!revokedToken) throw new Error('Revoked session cookie was not set.')
    const revokedSession = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(revokedToken) } })
    await prisma.authSession.update({ where: { id: revokedSession!.id }, data: { revokedAt: new Date() } })
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: revokedCookie } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'shifd_session=invalid' } })).statusCode).toBe(401)
    await app.close()
  })
})
