import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for prospect integration tests.')
const suite = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl, ALLOWED_ORIGIN: origin })
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `prospect-${suffix}@example.test`; const otherEmail = `prospect-other-${suffix}@example.test`
let companyId = ''; let otherCompanyId = ''

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) { const value = response.headers['set-cookie']; const first = Array.isArray(value) ? value[0] : value; return typeof first === 'string' ? first.split(';')[0] ?? '' : '' }
async function login(app: Awaited<ReturnType<typeof buildApp>>, userEmail: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: userEmail, password: 'correct-password' } })
  return { cookie: cookieFrom(response), csrf: response.json().data.csrfToken as string }
}
function mutation(auth: { cookie: string; csrf: string }, version?: number) { return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) } }
async function xlsx(rows: unknown[][]) { const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Targets'); rows.forEach((row) => sheet.addRow(row)); return Buffer.from(await workbook.xlsx.writeBuffer()) }
function multipart(file: Buffer, filename = 'targets.xlsx', mapping?: Record<string, number | ''>) {
  const boundary = `prospects-${suffix}`; const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`; const mapPart = mapping ? `\r\n--${boundary}\r\nContent-Disposition: form-data; name="headerMap"\r\n\r\n${JSON.stringify(mapping)}` : ''; const ending = `\r\n--${boundary}--\r\n`
  return { payload: Buffer.concat([Buffer.from(prefix), file, Buffer.from(mapPart + ending)]), contentType: `multipart/form-data; boundary=${boundary}` }
}

suite('Prospect Management API', () => {
  beforeAll(async () => {
    await prisma.$connect()
    const primary = await bootstrapOperator(prisma, { companyName: 'Synthetic Prospect Test', companyDescription: 'Isolated test company', userName: 'Prospect Test', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(prisma, { companyName: 'Synthetic Other Test', companyDescription: 'Isolated second company', userName: 'Prospect Other', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Test bootstrap reused a test identity.')
    companyId = primary.company.id; otherCompanyId = other.company.id
  })
  afterAll(async () => {
    if (companyId) await prisma.prospect.deleteMany({ where: { companyId } })
    if (otherCompanyId) await prisma.prospect.deleteMany({ where: { companyId: otherCompanyId } })
    for (const id of [companyId, otherCompanyId]) if (id) {
      await prisma.prospectImportBatch.deleteMany({ where: { companyId: id } })
      await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
      await prisma.bmcBlock.deleteMany({ where: { companyId: id } }); await prisma.brandProfile.deleteMany({ where: { companyId: id } }); await prisma.aiSettings.deleteMany({ where: { companyId: id } })
      await prisma.socialAccount.deleteMany({ where: { companyId: id } }); await prisma.user.deleteMany({ where: { companyId: id } }); await prisma.company.deleteMany({ where: { id } })
    }
    await prisma.$disconnect()
  })

  async function openApp() {
    const app = await buildApp({ config, logger: false })
    return { app, auth: await login(app, email), other: await login(app, otherEmail) }
  }

  it('creates, updates, validates, scopes, searches, filters, and paginates prospects', async () => {
    const { app, auth, other } = await openApp()
    try {
      const invalid = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(auth), payload: { name: '', secret: true } })
      expect(invalid.statusCode).toBe(422)
      const created = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(auth), payload: { name: 'Manual Synthetic Co', industry: 'Advanced Materials', contactEmail: 'a@example.test' } })
      expect(created.statusCode).toBe(201)
      const id = created.json().data.id as string
      expect((await app.inject({ method: 'GET', url: `/api/prospects/${id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
      const updated = await app.inject({ method: 'PUT', url: `/api/prospects/${id}`, headers: mutation(auth, 1), payload: { name: 'Edited Synthetic Co', industry: 'Materials', status: 'qualified' } })
      expect(updated.statusCode).toBe(200); expect(updated.json().data.version).toBe(2)
      expect((await app.inject({ method: 'PUT', url: `/api/prospects/${id}`, headers: mutation(auth, 1), payload: { name: 'Stale' } })).statusCode).toBe(412)

      const otherCreated = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(other), payload: { name: 'Edited Other Synthetic Co', industry: 'Materials', status: 'qualified' } })
      expect(otherCreated.statusCode).toBe(201)
      for (const url of [
        '/api/prospects?search=Edited',
        '/api/prospects?search=edited',
        '/api/prospects?industry=Materials',
        '/api/prospects?status=qualified',
        '/api/prospects?search=Edited&industry=Materials',
        '/api/prospects?search=Edited&status=qualified',
        '/api/prospects?search=Edited&industry=Materials&status=qualified',
      ]) {
        const response = await app.inject({ method: 'GET', url, headers: { cookie: auth.cookie } })
        expect(response.statusCode).toBe(200)
        expect(response.json().data.map((record: { id: string }) => record.id)).toEqual([id])
      }
      const noMatch = await app.inject({ method: 'GET', url: '/api/prospects?search=no-such-organization', headers: { cookie: auth.cookie } })
      expect(noMatch.statusCode).toBe(200); expect(noMatch.json().data).toHaveLength(0)

      for (const name of ['Pagination Fixture One', 'Pagination Fixture Two']) {
        const response = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(auth), payload: { name } })
        expect(response.statusCode).toBe(201)
      }
      const firstPage = await app.inject({ method: 'GET', url: '/api/prospects?search=Pagination%20Fixture&page=1&limit=1', headers: { cookie: auth.cookie } })
      const secondPage = await app.inject({ method: 'GET', url: '/api/prospects?search=Pagination%20Fixture&page=2&limit=1', headers: { cookie: auth.cookie } })
      expect(firstPage.json().page.total).toBe(2)
      expect(firstPage.json().data).toHaveLength(1); expect(secondPage.json().data).toHaveLength(1)
      expect(firstPage.json().data[0].id).not.toBe(secondPage.json().data[0].id)
    } finally { await app.close() }
  })

  it('previews without writes, confirms transactionally, prevents repeats, and protects preview ownership', async () => {
    const { app, auth, other } = await openApp()
    try {
      const file = await xlsx([['Organization', 'Sector', 'Domain', 'People', 'Email'], ['Synthetic Export', 'Finance technology', 'synthetic-export.example', 80, 'contact@example.test'], ['', 'Services', '', -1, 'bad-email']])
      const form = multipart(file)
      const beforePreview = await prisma.prospect.count({ where: { companyId } })
      const preview = await app.inject({ method: 'POST', url: '/api/prospects/import/preview', headers: { ...mutation(auth), 'content-type': form.contentType }, payload: form.payload })
      expect(preview.statusCode).toBe(200); expect(preview.json().data.summary).toMatchObject({ total: 2, valid: 1, invalid: 1 })
      expect(await prisma.prospect.count({ where: { companyId, name: 'Synthetic Export' } })).toBe(0)
      const token = preview.json().data.previewToken as string
      expect(preview.json().data.rows[1].status).toBe('invalid')
      const beforeConfirmation = await prisma.prospect.count({ where: { companyId } })
      expect(beforeConfirmation).toBe(beforePreview)
      const confirmationPayload = { confirmed: true, previewToken: token, selectedRowNumbers: [2] }
      const [imported, concurrent] = await Promise.all([
        app.inject({ method: 'POST', url: '/api/prospects/import/confirm', headers: mutation(auth), payload: confirmationPayload }),
        app.inject({ method: 'POST', url: '/api/prospects/import/confirm', headers: mutation(auth), payload: confirmationPayload }),
      ])
      expect([imported.statusCode, concurrent.statusCode].sort()).toEqual([201, 409])
      const success = imported.statusCode === 201 ? imported : concurrent
      expect(success.json().data.imported).toBe(1)
      expect(success.json().data.prospects[0].source).toBe('excel_import')
      const repeatedPreview = await app.inject({ method: 'POST', url: '/api/prospects/import/preview', headers: { ...mutation(auth), 'content-type': form.contentType }, payload: form.payload })
      expect(repeatedPreview.json().data.summary.duplicates).toBe(1)
      expect(repeatedPreview.json().data.rows[0].status).toBe('duplicate')
      const otherConfirm = await app.inject({ method: 'POST', url: '/api/prospects/import/confirm', headers: mutation(other), payload: { confirmed: true, previewToken: repeatedPreview.json().data.previewToken, selectedRowNumbers: [2] } })
      expect(otherConfirm.statusCode).toBe(404)
      const malformed = multipart(Buffer.from('not a workbook'))
      expect((await app.inject({ method: 'POST', url: '/api/prospects/import/preview', headers: { ...mutation(auth), 'content-type': malformed.contentType }, payload: malformed.payload })).statusCode).toBe(400)
    } finally { await app.close() }
  })

  it('archives without deleting and excludes archived prospects by default', async () => {
    const { app, auth } = await openApp()
    try {
      const created = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(auth), payload: { name: 'Archive Fixture Co', industry: 'Testing' } })
      expect(created.statusCode).toBe(201)
      const id = created.json().data.id as string
      const archived = await app.inject({ method: 'POST', url: `/api/prospects/${id}/archive`, headers: mutation(auth, created.json().data.version), payload: {} })
      expect(archived.statusCode).toBe(200); expect(archived.json().data.archivedAt).toBeTruthy()
      expect(await prisma.prospect.count({ where: { id, companyId } })).toBe(1)
      const defaultList = await app.inject({ method: 'GET', url: '/api/prospects?search=Archive%20Fixture', headers: { cookie: auth.cookie } })
      const archivedList = await app.inject({ method: 'GET', url: '/api/prospects?search=Archive%20Fixture&archived=true', headers: { cookie: auth.cookie } })
      expect(defaultList.statusCode).toBe(200); expect(defaultList.json().data).toHaveLength(0)
      expect(archivedList.statusCode).toBe(200); expect(archivedList.json().data.map((record: { id: string }) => record.id)).toEqual([id])
    } finally { await app.close() }
  })
})
