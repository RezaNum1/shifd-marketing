import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { cleanupAssets } from '../src/modules/assets/service.js'
import { LocalAssetStorage } from '../src/modules/assets/storage.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
if (process.env.REQUIRE_DATABASE === '1' && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the Phase 5 Asset integration suite.')
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? '' } } })
const suffix = Date.now().toString()
const email = `phase5-${suffix}@example.test`
const otherEmail = `phase5-other-${suffix}@example.test`
let storageRoot = ''
let config: AppConfig
let companyId = ''
let otherCompanyId = ''
let contentId = ''
let otherContentId = ''
let instagramVariantId = ''
let linkedinVariantId = ''
let otherAssetId = ''
let pngBytes: Buffer
let jpegBytes: Buffer

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(app: Awaited<ReturnType<typeof buildApp>>, loginEmail = email) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: loginEmail, password: 'correct-password' } })
  return { cookie: cookieFrom(response), csrf: response.json<{ data: { csrfToken: string } }>().data.csrfToken }
}

function mutationHeaders(auth: { cookie: string; csrf: string }, version?: number) {
  return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

function multipart(file: Buffer, filename: string, mimetype: string, purpose = 'creative') {
  const boundary = `----phase5-${suffix}-${Math.random().toString(16).slice(2)}`
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`
  const suffixPart = `\r\n--${boundary}--\r\n`
  return { payload: Buffer.concat([Buffer.from(prefix), file, Buffer.from(suffixPart)]), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function upload(app: Awaited<ReturnType<typeof buildApp>>, auth: { cookie: string; csrf: string }, key: string, file = pngBytes, filename = 'creative.png', mimetype = 'image/png', purpose = 'creative') {
  const form = multipart(file, filename, mimetype, purpose)
  return app.inject({ method: 'POST', url: '/api/assets', headers: { ...mutationHeaders(auth), 'idempotency-key': key, 'content-type': form.contentType }, payload: form.payload })
}

function companyBrief(topic: string) {
  return { contextType: 'company', productId: null, pillarCode: 'educational', objective: 'awareness', targetAudience: 'Operations teams', topic, angle: null, additionalInstructions: null }
}

function master(title = 'A useful master story') {
  return { title, coreMessage: 'Clear ownership improves a handoff.', hook: 'Where does the work go next?', body: 'Map the handoff and owner in one practical view.', cta: 'Review the next handoff.' }
}

function copy(platform: 'instagram' | 'linkedin') {
  return { copy: `${platform} copy for the handoff.`, cta: 'Review the next handoff.', hashtags: '#workflow #operations', visualRecommendation: 'Show the handoff clearly.' }
}

async function createContent(app: Awaited<ReturnType<typeof buildApp>>, auth: { cookie: string; csrf: string }, key: string, topic: string, platforms = ['instagram', 'linkedin']) {
  return app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': key }, payload: { brief: companyBrief(topic), enabledPlatforms: platforms } })
}

async function contentDetail(app: Awaited<ReturnType<typeof buildApp>>, auth: { cookie: string; csrf: string }, id = contentId) {
  return app.inject({ method: 'GET', url: `/api/contents/${id}`, headers: { cookie: auth.cookie } })
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.variantAsset.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.contentEvent.deleteMany({ where: { content: { companyId: id } } })
  await prisma.platformVariant.updateMany({ where: { content: { companyId: id } }, data: { reuseCreativeFromVariantId: null } })
  await prisma.platformVariant.deleteMany({ where: { content: { companyId: id } } })
  await prisma.contentBrief.deleteMany({ where: { content: { companyId: id } } })
  await prisma.content.deleteMany({ where: { companyId: id } })
  await prisma.contentIdea.deleteMany({ where: { companyId: id } })
  await prisma.creativeAsset.deleteMany({ where: { companyId: id } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
  await prisma.productProfile.deleteMany({ where: { product: { companyId: id } } })
  await prisma.product.deleteMany({ where: { companyId: id } })
  await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
  await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
  await prisma.brandProfile.deleteMany({ where: { companyId: id } })
  await prisma.aiSettings.deleteMany({ where: { companyId: id } })
  await prisma.user.deleteMany({ where: { companyId: id } })
  await prisma.company.deleteMany({ where: { id } })
}

runIntegration('Phase 5 Asset storage and creative reuse', () => {
  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'shifd-phase5-assets-'))
    config = { ...loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: process.env.DATABASE_URL, ALLOWED_ORIGIN: origin, ASSET_STORAGE_ROOT: storageRoot }) }
    await prisma.$connect()
    const primary = await bootstrapOperator(prisma, { companyName: 'Phase 5 Company', companyDescription: 'Asset integration company', userName: 'Phase 5 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(prisma, { companyName: 'Phase 5 Other', companyDescription: 'Other asset company', userName: 'Phase 5 Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 5 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    pngBytes = await sharp({ create: { width: 2, height: 3, channels: 4, background: { r: 20, g: 80, b: 140, alpha: 1 } } }).png().toBuffer()
    jpegBytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: { r: 180, g: 60, b: 40 } } }).jpeg().toBuffer()
  })

  afterAll(async () => {
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
  })

  it('A01-A06/A45: uploads valid PNG/JPEG, hides private metadata, and authorizes reads', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const png = await upload(app, auth, 'asset-png')
    const jpeg = await upload(app, auth, 'asset-jpeg', jpegBytes, 'brand-photo.jpg', 'application/octet-stream')
    expect(png.statusCode).toBe(201)
    expect(jpeg.statusCode).toBe(201)
    const pngData = png.json().data
    const jpegData = jpeg.json().data
    expect(pngData).toMatchObject({ mimeType: 'image/png', width: 2, height: 3, purpose: 'creative', contentUrl: `/api/assets/${pngData.id}/content` })
    expect(jpegData).toMatchObject({ mimeType: 'image/jpeg', width: 3, height: 2 })
    expect(Object.keys(pngData).sort()).toEqual(['contentUrl', 'createdAt', 'fileName', 'height', 'id', 'mimeType', 'purpose', 'sizeBytes', 'width'])
    expect(JSON.stringify(pngData)).not.toContain('storageKey')
    expect(JSON.stringify(pngData)).not.toContain('checksumSha256')
    const metadata = await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}`, headers: { cookie: auth.cookie } })
    expect(metadata.statusCode).toBe(200)
    const content = await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}/content`, headers: { cookie: auth.cookie } })
    expect(content.statusCode).toBe(200)
    expect(content.headers['content-type']).toContain('image/png')
    expect(content.headers['cache-control']).toBe('private, no-store')
    expect(Buffer.from((content as unknown as { rawPayload: Buffer }).rawPayload)).toEqual(pngBytes)
    const download = await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}/content?download=true`, headers: { cookie: auth.cookie } })
    expect(download.headers['content-disposition']).toContain('attachment')
    expect((await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}` })).statusCode).toBe(401)
    const other = await session(app, otherEmail)
    const otherAsset = await upload(app, other, 'other-company-asset', pngBytes)
    expect(otherAsset.statusCode).toBe(201)
    otherAssetId = otherAsset.json().data.id
    expect((await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${pngData.id}/content`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    await app.close()
  })

  it('A07-A12/A46: validates bytes and dimensions instead of trusting multipart metadata', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const before = {
      assets: await prisma.creativeAsset.count({ where: { companyId } }),
      idempotency: await prisma.requestIdempotency.count({ where: { companyId } }),
      finalFiles: (await readdir(storageRoot)).filter((entry) => entry !== '.tmp').sort(),
    }
    expect((await upload(app, auth, 'asset-html', Buffer.from('<html>no image</html>'), 'fake.jpg', 'image/jpeg')).statusCode).toBe(415)
    expect((await upload(app, auth, 'asset-svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'fake.png', 'image/png')).statusCode).toBe(415)
    expect((await upload(app, auth, 'asset-arbitrary', Buffer.from([0x00, 0x01, 0x02, 0x03]), 'arbitrary.bin', 'application/octet-stream')).statusCode).toBe(415)
    expect((await upload(app, auth, 'asset-corrupt', pngBytes.subarray(0, 10), 'broken.png', 'image/png')).statusCode).toBe(422)
    expect((await upload(app, auth, 'asset-corrupt-jpeg', jpegBytes.subarray(0, 3), 'broken.jpg', 'image/jpeg')).statusCode).toBe(422)
    expect((await upload(app, auth, 'asset-oversized', Buffer.alloc(config.assetMaxBytes + 1), 'large.jpg', 'image/jpeg')).statusCode).toBe(413)
    const largeImage = await sharp({ create: { width: config.assetMaxWidth + 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()
    expect((await upload(app, auth, 'asset-large-dimensions', largeImage)).statusCode).toBe(422)
    expect(await prisma.creativeAsset.count({ where: { companyId } })).toBe(before.assets)
    expect(await prisma.requestIdempotency.count({ where: { companyId } })).toBe(before.idempotency)
    expect((await readdir(storageRoot)).filter((entry) => entry !== '.tmp').sort()).toEqual(before.finalFiles)
    expect(await readdir(join(storageRoot, '.tmp'))).toHaveLength(0)
    const pathAttempt = await app.inject({ method: 'DELETE', url: '/api/assets/../../etc/passwd', headers: mutationHeaders(auth), payload: { storageKey: '../../etc/passwd' } })
    expect(pathAttempt.statusCode).not.toBe(204)
    await app.close()
  })

  it('A13-A15: replays upload idempotency without global checksum deduplication', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const first = await upload(app, auth, 'asset-idempotent')
    const replay = await upload(app, auth, 'asset-idempotent')
    const changedPurpose = await upload(app, auth, 'asset-idempotent', pngBytes, 'creative.png', 'image/png', 'metric_evidence')
    const independent = await upload(app, auth, 'asset-idempotent-other-key')
    expect(first.statusCode).toBe(201)
    expect(replay.statusCode).toBe(201)
    expect(replay.json().data.id).toBe(first.json().data.id)
    expect(changedPurpose.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } })
    expect(independent.statusCode).toBe(201)
    expect(independent.json().data.id).not.toBe(first.json().data.id)
    expect(await prisma.creativeAsset.count({ where: { companyId } })).toBe(4)
    await app.close()
  })

  it('A16-A25/A35-A40: replaces ordered own attachments atomically and preserves detached Assets', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const created = await createContent(app, auth, 'asset-content', 'Asset attachment workflow')
    expect(created.statusCode).toBe(201)
    contentId = created.json().data.id
    const initial = await contentDetail(app, auth)
    const versionBeforeUpload = initial.json().data.version
    instagramVariantId = initial.json().data.variants.find((variant: { platform: string }) => variant.platform === 'instagram').id
    linkedinVariantId = initial.json().data.variants.find((variant: { platform: string }) => variant.platform === 'linkedin').id
    const assets = await prisma.creativeAsset.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } })
    const creativeAssets = assets.filter((asset) => asset.purpose === 'creative')
    const metric = (await upload(app, auth, 'asset-metric', pngBytes, 'metric.png', 'image/png', 'metric_evidence')).json().data
    expect((await contentDetail(app, auth)).json().data.version).toBe(versionBeforeUpload)
    const png = creativeAssets[0]!
    const jpeg = creativeAssets[1]!
    const attached = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 1), payload: { assetIds: [png.id, jpeg.id] } })
    expect(attached.statusCode).toBe(200)
    expect(attached.headers.etag).toBe('"2"')
    expect(attached.json().data.variants.find((variant: { platform: string }) => variant.platform === 'instagram').ownAssets.map((link: { asset: { id: string } }) => link.asset.id)).toEqual([png.id, jpeg.id])
    expect((await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 2), payload: { assetIds: [png.id, png.id] } })).statusCode).toBe(422)
    expect((await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 2), payload: { assetIds: [metric.id] } })).statusCode).toBe(422)
    expect((await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 2), payload: { assetIds: [otherAssetId] } })).statusCode).toBe(404)
    const reordered = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 2), payload: { assetIds: [jpeg.id, png.id] } })
    expect(reordered.statusCode).toBe(200)
    expect(reordered.headers.etag).toBe('"3"')
    expect(reordered.json().data.editorialRevision).toBe(3)
    expect(reordered.json().data.variants.find((variant: { platform: string }) => variant.platform === 'instagram').revision).toBe(1)
    expect(reordered.json().data.variants.find((variant: { platform: string }) => variant.platform === 'linkedin').revision).toBe(1)
    const unchanged = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 3), payload: { assetIds: [jpeg.id, png.id] } })
    expect(unchanged.statusCode).toBe(200)
    expect(unchanged.headers.etag).toBe('"3"')
    const detached = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 3), payload: { assetIds: [] } })
    expect(detached.statusCode).toBe(200)
    expect(detached.headers.etag).toBe('"4"')
    expect((await app.inject({ method: 'GET', url: `/api/assets/${png.id}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    const detachedBytes = await app.inject({ method: 'GET', url: `/api/assets/${png.id}/content`, headers: { cookie: auth.cookie } })
    expect(detachedBytes.statusCode).toBe(200)
    expect(await prisma.variantAsset.count({ where: { variantId: instagramVariantId } })).toBe(0)
    expect((await app.inject({ method: 'DELETE', url: `/api/assets/${metric.id}`, headers: mutationHeaders(auth), payload: {} })).statusCode).toBe(204)
    await app.close()
  })

  it('A17/A21/A29-A34: resolves LinkedIn creative reuse without deleting custom own Assets', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const assets = await prisma.creativeAsset.findMany({ where: { companyId, purpose: 'creative' }, orderBy: { createdAt: 'asc' } })
    const [png, jpeg] = assets
    const instagram = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram/assets`, headers: mutationHeaders(auth, 4), payload: { assetIds: [png!.id, jpeg!.id] } })
    const linkedin = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/linkedin/assets`, headers: mutationHeaders(auth, instagram.json().data.version), payload: { assetIds: [jpeg!.id] } })
    const reused = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/linkedin/creative-reuse`, headers: mutationHeaders(auth, linkedin.json().data.version), payload: { reuseInstagramCreative: true } })
    expect(reused.statusCode).toBe(200)
    const linked = reused.json().data.variants.find((variant: { platform: string }) => variant.platform === 'linkedin')
    expect(linked).toMatchObject({ reuseCreativeFromVariantId: instagramVariantId })
    expect(linked.ownAssets.map((link: { asset: { id: string } }) => link.asset.id)).toEqual([jpeg!.id])
    expect(linked.effectiveAssets.map((link: { asset: { id: string } }) => link.asset.id)).toEqual([png!.id, jpeg!.id])
    const off = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/linkedin/creative-reuse`, headers: mutationHeaders(auth, reused.json().data.version), payload: { reuseInstagramCreative: false } })
    expect(off.statusCode).toBe(200)
    expect(off.json().data.variants.find((variant: { platform: string }) => variant.platform === 'linkedin').effectiveAssets.map((link: { asset: { id: string } }) => link.asset.id)).toEqual([jpeg!.id])
    await prisma.platformVariant.update({ where: { id: instagramVariantId }, data: { enabled: false } })
    const historical = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/linkedin/creative-reuse`, headers: mutationHeaders(auth, off.json().data.version), payload: { reuseInstagramCreative: true } })
    expect(historical.statusCode).toBe(200)
    const events = await app.inject({ method: 'GET', url: `/api/contents/${contentId}/events`, headers: { cookie: auth.cookie } })
    expect(events.json().data.some((event: { type: string; metadata: Record<string, unknown> }) => event.type === 'content_updated' && event.metadata.asset_collection === 'creative_reuse')).toBe(true)
    const eventMetadata = JSON.stringify(events.json().data.map((event: { metadata: unknown }) => event.metadata))
    expect(eventMetadata).not.toMatch(/storageKey|storage_key|checksumSha256|checksum_sha256|absolutePath|absolute_path|csrf|session/i)
    await prisma.platformVariant.update({ where: { id: instagramVariantId }, data: { enabled: true } })
    await app.close()
  })

  it('A26-A28/A44: duplicates Content with the same immutable Asset links and remapped reuse pointers', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const source = await contentDetail(app, auth)
    const sourceAssetCount = await prisma.creativeAsset.count({ where: { companyId } })
    const duplicate = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/duplicate`, headers: { ...mutationHeaders(auth, source.json().data.version), 'idempotency-key': 'asset-content-duplicate' }, payload: {} })
    expect(duplicate.statusCode).toBe(201)
    const duplicateData = duplicate.json().data
    const duplicateInstagram = duplicateData.variants.find((variant: { platform: string }) => variant.platform === 'instagram')
    const duplicateLinkedIn = duplicateData.variants.find((variant: { platform: string }) => variant.platform === 'linkedin')
    expect(duplicateData).toMatchObject({ editorialStage: 'draft', version: 1, archivedAt: null })
    expect(duplicateInstagram.id).not.toBe(instagramVariantId)
    expect(duplicateLinkedIn.id).not.toBe(linkedinVariantId)
    expect(duplicateLinkedIn.reuseCreativeFromVariantId).toBe(duplicateInstagram.id)
    expect(duplicateInstagram.effectiveAssets.map((link: { asset: { id: string } }) => link.asset.id)).toEqual((await prisma.variantAsset.findMany({ where: { variantId: instagramVariantId }, orderBy: { sortOrder: 'asc' } })).map((link) => link.assetId))
    await expect(prisma.platformVariant.update({ where: { id: linkedinVariantId }, data: { reuseCreativeFromVariantId: duplicateInstagram.id } })).rejects.toMatchObject({ code: 'P2003' })
    expect(await prisma.creativeAsset.count({ where: { companyId } })).toBe(sourceAssetCount)
    expect((await contentDetail(app, auth)).json().data.version).toBe(source.json().data.version)
    const archivedDuplicate = await app.inject({ method: 'POST', url: `/api/contents/${duplicateData.id}/archive`, headers: mutationHeaders(auth, duplicateData.version), payload: {} })
    expect(archivedDuplicate.statusCode).toBe(200)
    expect(archivedDuplicate.json().data.lifecycleStatus).toBe('Archived')
    expect(archivedDuplicate.json().data.variants.find((variant: { platform: string }) => variant.platform === 'instagram').ownAssets).toHaveLength(2)
    otherContentId = duplicateData.id
    await app.close()
  })

  it('A41-A43: preserves D-03 conditional creative eligibility without inventing asset requirements', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const created = await createContent(app, auth, 'asset-d03-content', 'D-03 creative gate')
    const id = created.json().data.id as string
    let detail = await contentDetail(app, auth, id)
    let version = detail.json().data.version as number
    const masterSaved = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: mutationHeaders(auth, version), payload: { master: master() } })
    version = masterSaved.json().data.version
    const instagramSaved = await app.inject({ method: 'PUT', url: `/api/contents/${id}/variants/instagram`, headers: mutationHeaders(auth, version), payload: copy('instagram') })
    version = instagramSaved.json().data.version
    const linkedinSaved = await app.inject({ method: 'PUT', url: `/api/contents/${id}/variants/linkedin`, headers: mutationHeaders(auth, version), payload: copy('linkedin') })
    version = linkedinSaved.json().data.version
    const adapted = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: mutationHeaders(auth, version), payload: { stage: 'adapted' } })
    version = adapted.json().data.version
    const ready = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: mutationHeaders(auth, version), payload: { designStatus: 'ready' } })
    version = ready.json().data.version
    const noAssets = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: mutationHeaders(auth, version), payload: { stage: 'ready_for_review' } })
    expect(noAssets.statusCode).toBe(409)
    const inProgress = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: mutationHeaders(auth, version), payload: { designStatus: 'in_progress' } })
    version = inProgress.json().data.version
    const withoutReadyDesign = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: mutationHeaders(auth, version), payload: { stage: 'ready_for_review' } })
    expect(withoutReadyDesign.statusCode).toBe(200)
    version = withoutReadyDesign.json().data.version
    detail = await contentDetail(app, auth, id)
    const png = (await prisma.creativeAsset.findFirstOrThrow({ where: { companyId, purpose: 'creative' } })).id
    const attached = await app.inject({ method: 'PUT', url: `/api/contents/${id}/variants/instagram/assets`, headers: mutationHeaders(auth, version), payload: { assetIds: [png] } })
    version = attached.json().data.version
    expect(attached.json().data.editorialStage).toBe('draft')
    const reused = await app.inject({ method: 'PUT', url: `/api/contents/${id}/variants/linkedin/creative-reuse`, headers: mutationHeaders(auth, version), payload: { reuseInstagramCreative: true } })
    version = reused.json().data.version
    const adaptedAgain = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: mutationHeaders(auth, version), payload: { stage: 'adapted' } })
    version = adaptedAgain.json().data.version
    const designReady = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: mutationHeaders(auth, version), payload: { designStatus: 'ready' } })
    version = designReady.json().data.version
    const reviewWithReuse = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: mutationHeaders(auth, version), payload: { stage: 'ready_for_review' } })
    expect(reviewWithReuse.statusCode).toBe(200)
    expect(reviewWithReuse.json().data.variants.find((variant: { platform: string }) => variant.platform === 'linkedin').effectiveAssets).toHaveLength(1)
    await app.close()
  })

  it('A22-A25/A47-A50: deletes only unattached Assets and cleans expired files after reference rechecks', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const unattached = (await upload(app, auth, 'asset-delete-me', jpegBytes, 'delete-me.jpg', 'image/jpeg')).json().data
    const storageKey = (await prisma.creativeAsset.findUniqueOrThrow({ where: { id: unattached.id } })).storageKey
    expect((await app.inject({ method: 'DELETE', url: `/api/assets/${unattached.id}`, headers: mutationHeaders(auth), payload: {} })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${unattached.id}`, headers: { cookie: auth.cookie } })).statusCode).toBe(404)
    expect(existsSync(join(storageRoot, storageKey))).toBe(false)

    const attached = await prisma.variantAsset.findFirstOrThrow({ where: { variant: { contentId } } })
    expect((await app.inject({ method: 'DELETE', url: `/api/assets/${attached.assetId}`, headers: mutationHeaders(auth), payload: {} })).json()).toMatchObject({ error: { code: 'ASSET_IN_USE' } })
    const old = (await upload(app, auth, 'asset-cleanup-old', pngBytes, 'old.png', 'image/png')).json().data
    const oldKey = (await prisma.creativeAsset.findUniqueOrThrow({ where: { id: old.id } })).storageKey
    await prisma.creativeAsset.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } })
    const recent = (await upload(app, auth, 'asset-cleanup-recent')).json().data
    const storage = new LocalAssetStorage(storageRoot)
    await storage.initialize()
    const result = await cleanupAssets(prisma, storage, companyId, config.assetUnattachedGraceHours)
    expect(result.deleted).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(storageRoot, oldKey))).toBe(false)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${recent.id}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    const attachedRow = await prisma.creativeAsset.findUniqueOrThrow({ where: { id: attached.assetId } })
    await prisma.creativeAsset.update({ where: { id: attached.assetId }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } })
    const skipped = await cleanupAssets(prisma, storage, companyId, config.assetUnattachedGraceHours)
    expect(skipped.skipped).toBeGreaterThanOrEqual(1)
    expect((await prisma.creativeAsset.findUnique({ where: { id: attachedRow.id } }))?.state).toBe('ready')
    await prisma.creativeAsset.update({ where: { id: recent.id }, data: { state: 'pending_delete' } })
    expect((await app.inject({ method: 'GET', url: `/api/assets/${recent.id}`, headers: { cookie: auth.cookie } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${recent.id}/content`, headers: { cookie: auth.cookie } })).statusCode).toBe(404)
    const orphanTemp = await storage.writeTemp((async function* () { yield pngBytes })(), config.assetMaxBytes)
    const orphanKey = await storage.promote(orphanTemp.key)
    const orphanDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(join(storageRoot, orphanKey), orphanDate, orphanDate)
    const orphanCleanup = await cleanupAssets(prisma, storage, undefined, config.assetUnattachedGraceHours)
    expect(orphanCleanup.orphanRemoved).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(storageRoot, orphanKey))).toBe(false)
    await app.close()
  })

  it('keeps asset and Content projections read-only across repeated metadata, bytes, and Content reads', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const beforeAssets = await prisma.creativeAsset.findMany({ where: { companyId }, orderBy: { id: 'asc' } })
    const beforeLinks = await prisma.variantAsset.findMany({ where: { variant: { content: { companyId } } }, orderBy: { id: 'asc' } })
    const assetId = beforeAssets.find((asset) => asset.state === 'ready')?.id
    if (!assetId) throw new Error('Expected a ready Asset fixture.')
    await app.inject({ method: 'GET', url: `/api/assets/${assetId}`, headers: { cookie: auth.cookie } })
    await app.inject({ method: 'GET', url: `/api/assets/${assetId}/content`, headers: { cookie: auth.cookie } })
    await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })
    await app.inject({ method: 'GET', url: '/api/contents', headers: { cookie: auth.cookie } })
    expect(await prisma.creativeAsset.findMany({ where: { companyId }, orderBy: { id: 'asc' } })).toEqual(beforeAssets)
    expect(await prisma.variantAsset.findMany({ where: { variant: { content: { companyId } } }, orderBy: { id: 'asc' } })).toEqual(beforeLinks)
    await app.close()
  })
})
