import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { encodeCursor, etag } from '../context/service.js'
import { executeIdempotent } from './idempotency.js'
import { deriveAdaptationState, deriveLifecycleStatus, deriveResumeStep, hasCompleteVariantCopy } from './lifecycle.js'
import type { ContentStage, DesignStatus, IdeaContextType, IdeaStatus, ObjectiveCode, PlatformCode, ProgressStage } from './constants.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface IdeaInput {
  title: string
  contextType: IdeaContextType
  productId: string | null
  pillarCode: string
  objective: ObjectiveCode
  targetAudience: string | null
  notes: string | null
}

export interface BriefInput {
  contextType: IdeaContextType
  productId: string | null
  pillarCode: string
  objective: ObjectiveCode
  targetAudience: string
  topic: string
  angle: string | null
  additionalInstructions: string | null
}

export interface MasterInput {
  title: string
  coreMessage: string
  hook: string
  body: string
  cta: string
}

export interface VisualDirectionInput {
  format: string
  concept: string
  structure: string[]
  notes: string
}

export interface VariantCopyInput {
  copy: string
  cta: string
  hashtags: string
  visualRecommendation: string
}

export interface ContentCreateInput {
  sourceIdeaId: string | null
  brief: BriefInput
  enabledPlatforms: PlatformCode[]
}

export interface ContentPatchInput {
  brief?: BriefInput
  master?: MasterInput | null
  visualDirection?: VisualDirectionInput | null
  enabledPlatforms?: PlatformCode[]
  designStatus?: DesignStatus
}

interface IdeaListOptions {
  status?: IdeaStatus | undefined
  search?: string | undefined
  contextType?: IdeaContextType | undefined
  productId?: string | undefined
  pillarCode?: string | undefined
  objective?: ObjectiveCode | undefined
  limit: number
  cursor?: { createdAt: Date; id: string } | undefined
}

interface ContentListOptions {
  search?: string | undefined
  contextType?: IdeaContextType | undefined
  productId?: string | undefined
  platform?: PlatformCode | undefined
  pillarCode?: string | undefined
  lifecycleStatus?: string | undefined
  limit: number
  cursor?: { createdAt: Date; id: string } | undefined
}

const contentInclude = {
  company: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  brief: true,
  variants: {
    orderBy: { platform: 'asc' },
    include: {
      assetLinks: { orderBy: { sortOrder: 'asc' }, include: { asset: true } },
      reuseCreativeFromVariant: true,
    },
  },
} satisfies Prisma.ContentInclude

type ContentRow = Prisma.ContentGetPayload<{ include: typeof contentInclude }>
type CompleteContentRow = ContentRow & { brief: NonNullable<ContentRow['brief']> }

export async function createIdea(prisma: PrismaClient, companyId: string, actorId: string, input: IdeaInput, idempotencyKey: string) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'content-idea.create',
    key: idempotencyKey,
    normalizedRequest: { actorId, idea: input },
    execute: async (tx) => {
      await validateNewContextReference(tx, companyId, input.contextType, input.productId, input.pillarCode, input.objective)
      const idea = await tx.contentIdea.create({ data: { companyId, ...input, createdBy: actorId } })
      const mapped = await readIdea(tx, companyId, idea.id)
      return { resourceId: idea.id, status: 201, body: { data: mapped }, etag: etag(mapped.version) }
    },
  })
}

export async function readIdea(db: Db, companyId: string, ideaId: string) {
  const idea = await db.contentIdea.findFirst({
    where: { id: ideaId, companyId },
    include: { sourceContents: { select: { id: true }, orderBy: { id: 'asc' } } },
  })
  if (!idea) throw notFound()
  return mapIdea(idea)
}

export async function listIdeas(prisma: PrismaClient, companyId: string, options: IdeaListOptions) {
  if (options.productId) await assertCompanyProduct(prisma, companyId, options.productId)
  const filters: Prisma.ContentIdeaWhereInput[] = [{ companyId }]
  if (options.status) filters.push({ status: options.status })
  if (options.contextType) filters.push({ contextType: options.contextType })
  if (options.productId) filters.push({ productId: options.productId })
  if (options.pillarCode) filters.push({ pillarCode: options.pillarCode })
  if (options.objective) filters.push({ objective: options.objective })
  if (options.search) {
    filters.push({ OR: [
      { title: { contains: options.search, mode: 'insensitive' } },
      { notes: { contains: options.search, mode: 'insensitive' } },
      { targetAudience: { contains: options.search, mode: 'insensitive' } },
      { product: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
      { company: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
    ] })
  }
  if (options.cursor) filters.push({ OR: [
    { updatedAt: { lt: options.cursor.createdAt } },
    { updatedAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
  ] })
  const rows = await prisma.contentIdea.findMany({
    where: { AND: filters },
    include: { sourceContents: { select: { id: true }, orderBy: { id: 'asc' } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  return {
    data: pageRows.map(mapIdea),
    nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  }
}

export async function updateIdea(prisma: PrismaClient, companyId: string, ideaId: string, expectedVersion: number, input: IdeaInput) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockIdea(tx, companyId, ideaId, expectedVersion)
    if (locked.status !== 'ready') throw conflict('Only Ready Ideas can be edited.')
    await validateNewContextReference(tx, companyId, input.contextType, input.productId, input.pillarCode, input.objective)
    await tx.contentIdea.update({ where: { id: ideaId }, data: { ...input, version: { increment: 1 } } })
    return readIdea(tx, companyId, ideaId)
  })
}

export async function duplicateIdea(prisma: PrismaClient, companyId: string, actorId: string, ideaId: string, expectedVersion: number, idempotencyKey: string) {
  return executeIdempotent(prisma, {
    companyId,
    operation: `content-idea.duplicate:${ideaId}`,
    key: idempotencyKey,
    normalizedRequest: { actorId, sourceIdeaId: ideaId, ifMatch: expectedVersion },
    execute: async (tx) => {
      await lockIdea(tx, companyId, ideaId, expectedVersion)
      const source = await tx.contentIdea.findFirst({ where: { id: ideaId, companyId } })
      if (!source) throw notFound()
      await validateNewContextReference(tx, companyId, source.contextType as IdeaContextType, source.productId, source.pillarCode, source.objective as ObjectiveCode)
      const duplicate = await tx.contentIdea.create({
        data: {
          companyId,
          title: `${source.title} (Copy)`,
          contextType: source.contextType,
          productId: source.productId,
          pillarCode: source.pillarCode,
          objective: source.objective,
          targetAudience: source.targetAudience,
          notes: source.notes,
          status: 'ready',
          createdBy: actorId,
        },
      })
      const mapped = await readIdea(tx, companyId, duplicate.id)
      return { resourceId: duplicate.id, status: 201, body: { data: mapped }, etag: etag(mapped.version) }
    },
  })
}

export async function archiveIdea(prisma: PrismaClient, companyId: string, ideaId: string, expectedVersion: number) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockIdea(tx, companyId, ideaId, expectedVersion)
    if (locked.status !== 'archived') {
      await tx.contentIdea.update({ where: { id: ideaId }, data: { status: 'archived', version: { increment: 1 } } })
    }
    return readIdea(tx, companyId, ideaId)
  })
}

export async function restoreIdea(prisma: PrismaClient, companyId: string, ideaId: string, expectedVersion: number) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockIdea(tx, companyId, ideaId, expectedVersion)
    if (locked.status !== 'archived') throw conflict('Only Archived Ideas can be restored.')
    await tx.contentIdea.update({ where: { id: ideaId }, data: { status: 'ready', version: { increment: 1 } } })
    return readIdea(tx, companyId, ideaId)
  })
}

export async function createContent(prisma: PrismaClient, companyId: string, actorId: string, input: ContentCreateInput, idempotencyKey: string, requestId: string) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'content.create',
    key: idempotencyKey,
    normalizedRequest: { actorId, content: input },
    execute: async (tx) => {
      await validateBriefReference(tx, companyId, input.brief)
      if (input.sourceIdeaId) {
        const idea = await lockIdea(tx, companyId, input.sourceIdeaId)
        if (idea.status !== 'ready') throw conflict('The source Idea is no longer Ready.')
      }
      const content = await tx.content.create({
        data: {
          companyId,
          sourceIdeaId: input.sourceIdeaId,
          contextType: input.brief.contextType,
          productId: input.brief.productId,
          editorialStage: 'draft',
          editorialRevision: 1,
          masterRevision: 0,
          designStatus: 'not_started',
          createdBy: actorId,
          masterContent: Prisma.DbNull,
          visualDirection: Prisma.DbNull,
          brief: { create: briefCreate(input.brief) },
          variants: { create: input.enabledPlatforms.map((platform) => ({ platform, enabled: true })) },
        },
      })
      if (input.sourceIdeaId) {
        await tx.contentIdea.update({ where: { id: input.sourceIdeaId }, data: { status: 'used', version: { increment: 1 } } })
      }
      await appendEvent(tx, { contentId: content.id, actorId, eventType: 'brief_created', metadata: { sourceIdeaId: input.sourceIdeaId, enabledPlatforms: input.enabledPlatforms }, requestId })
      const mapped = mapContent(await getContentAggregate(tx, companyId, content.id))
      return { resourceId: content.id, status: 201, body: { data: mapped }, etag: etag(mapped.version) }
    },
  })
}

export async function readContent(prisma: PrismaClient, companyId: string, contentId: string) {
  return mapContent(await getContentAggregate(prisma, companyId, contentId))
}

export async function listContents(prisma: PrismaClient, companyId: string, options: ContentListOptions) {
  if (options.productId) await assertCompanyProduct(prisma, companyId, options.productId)
  const filters: Prisma.ContentWhereInput[] = [{ companyId }]
  if (options.contextType) filters.push({ contextType: options.contextType })
  if (options.productId) filters.push({ productId: options.productId })
  if (options.platform) filters.push({ variants: { some: { platform: options.platform, enabled: true } } })
  if (options.pillarCode) filters.push({ brief: { is: { pillarCode: options.pillarCode } } })
  if (options.lifecycleStatus) filters.push(lifecycleFilter(options.lifecycleStatus))
  if (options.search) {
    filters.push({ OR: [
      { brief: { is: { topic: { contains: options.search, mode: 'insensitive' } } } },
      { company: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
      { product: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
      { masterContent: { path: ['title'], string_contains: options.search } },
    ] })
  }
  if (options.cursor) filters.push({ OR: [
    { updatedAt: { lt: options.cursor.createdAt } },
    { updatedAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
  ] })
  const rows = await prisma.content.findMany({
    where: { AND: filters },
    include: contentInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const complete = rows.filter(hasBrief)
  const pageRows = complete.slice(0, options.limit)
  const last = pageRows.at(-1)
  return {
    data: pageRows.map(mapContentSummary),
    nextCursor: complete.length > options.limit && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  }
}

export async function updateContent(prisma: PrismaClient, companyId: string, contentId: string, expectedVersion: number, input: ContentPatchInput, actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const current = await getContentAggregate(tx, companyId, contentId)
    if (current.archivedAt) throw conflict('Archived Content cannot be edited.')
    if (input.brief) await validateBriefReference(tx, companyId, input.brief)
    if (input.enabledPlatforms && input.enabledPlatforms.length === 0) throw validationError('At least one enabled platform is required.', { enabledPlatforms: 'Select Instagram or LinkedIn.' })

    const briefChanged = input.brief !== undefined && !sameBrief(current, input.brief)
    const masterChanged = input.master !== undefined && !sameJson(current.masterContent, input.master)
    const visualDirectionChanged = input.visualDirection !== undefined && !sameJson(current.visualDirection, input.visualDirection)
    const enabledPlatformsChanged = input.enabledPlatforms !== undefined && !sameEnabledPlatforms(current, input.enabledPlatforms)
    const designStatusChanged = input.designStatus !== undefined && input.designStatus !== current.designStatus
    const editorialInputChanged = briefChanged || masterChanged || visualDirectionChanged || enabledPlatformsChanged || designStatusChanged
    const nextStage = editorialInputChanged && current.editorialStage !== 'draft' ? 'draft' : current.editorialStage
    const update: Prisma.ContentUpdateInput = {
      version: { increment: 1 },
      editorialRevision: { increment: 1 },
    }
    if (nextStage !== current.editorialStage) update.editorialStage = nextStage
    if (input.brief) {
      update.contextType = input.brief.contextType
      update.product = input.brief.productId ? { connect: { id: input.brief.productId } } : { disconnect: true }
    }
    if (input.master !== undefined) {
      update.masterContent = input.master === null ? Prisma.DbNull : toJson(input.master)
      if (masterChanged) update.masterRevision = { increment: 1 }
    }
    if (input.visualDirection !== undefined) update.visualDirection = input.visualDirection === null ? Prisma.DbNull : toJson(input.visualDirection)
    if (input.designStatus !== undefined) update.designStatus = input.designStatus
    await tx.content.update({ where: { id: contentId }, data: update })

    if (input.brief) {
      await tx.contentBrief.update({ where: { contentId }, data: { ...briefUpdate(input.brief), version: { increment: 1 } } })
    }
    if (input.enabledPlatforms) await setEnabledPlatforms(tx, contentId, input.enabledPlatforms)
    await appendEvent(tx, {
      contentId,
      actorId,
      eventType: 'content_updated',
      metadata: { sections: Object.keys(input), masterRevisionChanged: masterChanged, stageRegressed: nextStage !== current.editorialStage },
      requestId,
    })
    return mapContent(await getContentAggregate(tx, companyId, contentId))
  })
}

export async function updateVariantCopy(prisma: PrismaClient, companyId: string, contentId: string, expectedVersion: number, platform: PlatformCode, input: VariantCopyInput, actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const content = await getContentAggregate(tx, companyId, contentId)
    if (content.archivedAt) throw conflict('Archived Content cannot be edited.')
    if (!decodeMaster(content.masterContent)) throw conflict('Create Master Content before saving a platform adaptation.')
    const variant = content.variants.find((item) => item.platform === platform)
    if (!variant) throw notFound()
    if (!variant.enabled) throw conflict('Enable the platform before saving its adaptation.')
    const copyChanged = variant.copy !== input.copy || variant.cta !== input.cta || variant.hashtags !== input.hashtags || variant.visualRecommendation !== input.visualRecommendation
    await tx.platformVariant.update({
      where: { id: variant.id },
      data: { ...input, revision: { increment: 1 }, adaptedFromMasterRevision: content.masterRevision },
    })
    await tx.content.update({ where: { id: contentId }, data: {
      version: { increment: 1 },
      editorialRevision: { increment: 1 },
      ...(copyChanged && content.editorialStage !== 'draft' ? { editorialStage: 'draft' } : {}),
    } })
    await appendEvent(tx, { contentId, variantId: variant.id, actorId, eventType: 'variant_updated', metadata: { platform, masterRevision: content.masterRevision, stageRegressed: copyChanged && content.editorialStage !== 'draft' }, requestId })
    return mapContent(await getContentAggregate(tx, companyId, contentId))
  })
}

export async function progressContent(prisma: PrismaClient, companyId: string, contentId: string, expectedVersion: number, stage: ProgressStage, actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const content = await getContentAggregate(tx, companyId, contentId)
    if (content.archivedAt) throw conflict('Archived Content cannot progress through the editorial workflow.')
    assertAdaptedPrerequisites(content)
    if (stage === 'ready_for_review' && content.designStatus === 'ready') assertCreativePrerequisites(content)
    // D-03 remains conditional: designStatus=ready requires effective creative
    // assets; other design states do not add an asset gate.
    await tx.content.update({ where: { id: contentId }, data: { editorialStage: stage, version: { increment: 1 } } })
    await appendEvent(tx, { contentId, actorId, eventType: 'progress_changed', metadata: { stage }, requestId })
    return mapContent(await getContentAggregate(tx, companyId, contentId))
  })
}

export async function duplicateContent(prisma: PrismaClient, companyId: string, actorId: string, contentId: string, expectedVersion: number, idempotencyKey: string, requestId: string) {
  return executeIdempotent(prisma, {
    companyId,
    operation: `content.duplicate:${contentId}`,
    key: idempotencyKey,
    normalizedRequest: { actorId, sourceContentId: contentId, ifMatch: expectedVersion },
    execute: async (tx) => {
      await lockContent(tx, companyId, contentId, expectedVersion)
      const source = await getContentAggregate(tx, companyId, contentId)
      const master = decodeMaster(source.masterContent)
      const direction = decodeVisualDirection(source.visualDirection)
      const duplicate = await tx.content.create({
        data: {
          companyId,
          sourceIdeaId: source.sourceIdeaId,
          contextType: source.contextType,
          productId: source.productId,
          editorialStage: 'draft',
          editorialRevision: 1,
          masterRevision: master ? Math.max(source.masterRevision, 1) : 0,
          designStatus: 'not_started',
          createdBy: actorId,
          masterContent: master ? toJson(master) : Prisma.DbNull,
          visualDirection: direction ? toJson(direction) : Prisma.DbNull,
          brief: { create: {
            pillarCode: source.brief.pillarCode,
            objective: source.brief.objective,
            targetAudience: source.brief.targetAudience,
            topic: source.brief.topic,
            angle: source.brief.angle,
            additionalInstructions: source.brief.additionalInstructions,
          } },
        },
      })
      const duplicatedVariants = new Map<string, string>()
      for (const variant of source.variants) {
        const createdVariant = await tx.platformVariant.create({
          data: {
            contentId: duplicate.id,
            platform: variant.platform,
            enabled: variant.enabled,
            copy: variant.copy,
            cta: variant.cta,
            hashtags: variant.hashtags,
            visualRecommendation: variant.visualRecommendation,
            revision: 1,
            adaptedFromMasterRevision: master ? variant.adaptedFromMasterRevision : null,
            assetLinks: { create: variant.assetLinks.map((link) => ({ assetId: link.assetId, sortOrder: link.sortOrder })) },
          },
        })
        duplicatedVariants.set(variant.platform, createdVariant.id)
      }
      const sourceLinkedIn = source.variants.find((variant) => variant.platform === 'linkedin')
      if (sourceLinkedIn?.reuseCreativeFromVariantId) {
        const duplicatedInstagramId = duplicatedVariants.get('instagram')
        const duplicatedLinkedInId = duplicatedVariants.get('linkedin')
        if (duplicatedInstagramId && duplicatedLinkedInId) {
          await tx.platformVariant.update({ where: { id: duplicatedLinkedInId }, data: { reuseCreativeFromVariantId: duplicatedInstagramId } })
        }
      }
      await appendEvent(tx, { contentId: duplicate.id, actorId, eventType: 'content_duplicated', metadata: { sourceContentId: contentId }, requestId })
      const mapped = mapContent(await getContentAggregate(tx, companyId, duplicate.id))
      return { resourceId: duplicate.id, status: 201, body: { data: mapped }, etag: etag(mapped.version) }
    },
  })
}

export async function archiveContent(prisma: PrismaClient, companyId: string, contentId: string, expectedVersion: number, actorId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, contentId, expectedVersion)
    const content = await getContentAggregate(tx, companyId, contentId)
    if (!content.archivedAt) {
      await tx.content.update({ where: { id: contentId }, data: { archivedAt: new Date(), version: { increment: 1 } } })
      await appendEvent(tx, { contentId, actorId, eventType: 'content_archived', metadata: {}, requestId })
    }
    return mapContent(await getContentAggregate(tx, companyId, contentId))
  })
}

export async function listContentEvents(prisma: PrismaClient, companyId: string, contentId: string, options: { limit: number; cursor?: { createdAt: Date; id: string } | undefined }) {
  await getContentAggregate(prisma, companyId, contentId)
  const filters: Prisma.ContentEventWhereInput[] = [{ contentId }]
  if (options.cursor) filters.push({ OR: [
    { createdAt: { lt: options.cursor.createdAt } },
    { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
  ] })
  const rows = await prisma.contentEvent.findMany({
    where: { AND: filters },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  return {
    data: pageRows.map((event) => ({
      id: event.id,
      type: event.eventType,
      contentId: event.contentId,
      variantId: event.variantId,
      actor: event.actor ? { id: event.actor.id, name: event.actor.name } : null,
      actorKind: event.actorKind,
      metadata: event.metadata,
      requestId: event.requestId,
      createdAt: event.createdAt.toISOString(),
    })),
    nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  }
}

async function validateNewContextReference(db: Db, companyId: string, contextType: IdeaContextType, productId: string | null, pillarCode: string, objective: ObjectiveCode) {
  await validateContextProduct(db, companyId, contextType, productId, true)
  await validatePillarAndObjective(db, pillarCode, objective)
}

async function validateBriefReference(db: Db, companyId: string, brief: BriefInput) {
  await validateContextProduct(db, companyId, brief.contextType, brief.productId, true)
  await validatePillarAndObjective(db, brief.pillarCode, brief.objective)
}

async function validateContextProduct(db: Db, companyId: string, contextType: IdeaContextType, productId: string | null, requireActive: boolean) {
  if (contextType === 'company') {
    if (productId !== null) throw validationError('Company context cannot select a Product.', { productId: 'Remove the Product for Company context.' })
    return
  }
  if (!productId) throw validationError('Product context requires a Product.', { productId: 'Choose an active Product.' })
  const product = await db.product.findFirst({ where: { id: productId, companyId } })
  if (!product) throw notFound()
  if (requireActive && product.status !== 'active') throw conflict('An inactive Product cannot be newly selected.')
}

async function validatePillarAndObjective(db: Db, pillarCode: string, objective: ObjectiveCode) {
  const pillar = await db.contentPillar.findFirst({ where: { code: pillarCode, active: true } })
  if (!pillar) throw validationError('The selected content pillar is not active.', { pillarCode: 'Choose an approved active content pillar.' })
  if (!['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'].includes(objective)) {
    throw validationError('The selected objective is invalid.', { objective: 'Choose an approved objective.' })
  }
}

async function assertCompanyProduct(db: Db, companyId: string, productId: string) {
  const product = await db.product.findFirst({ where: { id: productId, companyId }, select: { id: true } })
  if (!product) throw notFound()
}

async function lockIdea(tx: Prisma.TransactionClient, companyId: string, ideaId: string, expectedVersion?: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
    SELECT "id", "status", "version"
    FROM "content_ideas"
    WHERE "id" = CAST(${ideaId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const idea = rows[0]
  if (!idea) throw notFound()
  if (expectedVersion !== undefined && idea.version !== expectedVersion) throw revisionConflict()
  return idea
}

async function lockContent(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version"
    FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const content = rows[0]
  if (!content) throw notFound()
  if (content.version !== expectedVersion) throw revisionConflict()
  return content
}

async function getContentAggregate(db: Db, companyId: string, contentId: string): Promise<CompleteContentRow> {
  const content = await db.content.findFirst({ where: { id: contentId, companyId }, include: contentInclude })
  if (!content) throw notFound()
  if (!content.brief) throw conflict('Content persistence is incomplete: the required Brief is missing.')
  return content as CompleteContentRow
}

async function setEnabledPlatforms(tx: Prisma.TransactionClient, contentId: string, platforms: PlatformCode[]) {
  const existing = await tx.platformVariant.findMany({ where: { contentId }, select: { id: true, platform: true } })
  for (const platform of platforms) {
    const row = existing.find((item) => item.platform === platform)
    if (row) await tx.platformVariant.update({ where: { id: row.id }, data: { enabled: true } })
    else await tx.platformVariant.create({ data: { contentId, platform, enabled: true } })
  }
  for (const row of existing) {
    if (!platforms.includes(row.platform as PlatformCode)) await tx.platformVariant.update({ where: { id: row.id }, data: { enabled: false } })
  }
}

async function appendEvent(tx: Prisma.TransactionClient, input: { contentId: string; variantId?: string; actorId: string; eventType: string; metadata: Record<string, unknown>; requestId: string }) {
  await tx.contentEvent.create({
    data: {
      contentId: input.contentId,
      variantId: input.variantId ?? null,
      actorId: input.actorId,
      actorKind: 'user',
      eventType: input.eventType,
      metadata: toJson(input.metadata),
      requestId: input.requestId,
    },
  })
}

function briefCreate(brief: BriefInput) {
  return {
    pillarCode: brief.pillarCode,
    objective: brief.objective,
    targetAudience: brief.targetAudience,
    topic: brief.topic,
    angle: brief.angle,
    additionalInstructions: brief.additionalInstructions,
  }
}

function briefUpdate(brief: BriefInput) {
  return briefCreate(brief)
}

function mapIdea(idea: Prisma.ContentIdeaGetPayload<{ include: { sourceContents: { select: { id: true } } } }>) {
  return {
    id: idea.id,
    companyId: idea.companyId,
    title: idea.title,
    contextType: idea.contextType,
    productId: idea.productId,
    pillarCode: idea.pillarCode,
    objective: idea.objective,
    targetAudience: idea.targetAudience,
    notes: idea.notes,
    status: idea.status,
    relatedContentIds: idea.sourceContents.map((content) => content.id),
    version: idea.version,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  }
}

function mapContent(content: CompleteContentRow) {
  const master = decodeMaster(content.masterContent)
  const direction = decodeVisualDirection(content.visualDirection)
  return {
    id: content.id,
    companyId: content.companyId,
    sourceIdeaId: content.sourceIdeaId,
    title: master?.title ?? content.brief.topic,
    brief: {
      contextType: content.contextType,
      productId: content.productId,
      pillarCode: content.brief.pillarCode,
      objective: content.brief.objective,
      targetAudience: content.brief.targetAudience,
      topic: content.brief.topic,
      angle: content.brief.angle,
      additionalInstructions: content.brief.additionalInstructions,
    },
    master,
    visualDirection: direction,
    designStatus: content.designStatus,
    variants: content.variants.map((variant) => mapVariant(variant, content.variants, content.masterRevision, Boolean(master))),
    editorialStage: content.editorialStage,
    editorialRevision: content.editorialRevision,
    lifecycleStatus: deriveLifecycleStatus(content),
    resumeStep: deriveResumeStep(content),
    approval: null,
    archivedAt: content.archivedAt?.toISOString() ?? null,
    version: content.version,
    createdBy: { id: content.creator.id, name: content.creator.name },
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  }
}

function mapContentSummary(content: CompleteContentRow) {
  const master = decodeMaster(content.masterContent)
  return {
    id: content.id,
    title: master?.title ?? content.brief.topic,
    brief: { topic: content.brief.topic, pillarCode: content.brief.pillarCode, objective: content.brief.objective },
    company: { id: content.company.id, name: content.company.name },
    product: content.product ? { id: content.product.id, name: content.product.name } : null,
    enabledPlatforms: content.variants.filter((variant) => variant.enabled).map((variant) => variant.platform),
    lifecycleStatus: deriveLifecycleStatus(content),
    resumeStep: deriveResumeStep(content),
    scheduleSummary: [],
    publications: [],
    updatedAt: content.updatedAt.toISOString(),
    version: content.version,
  }
}

function mapVariant(variant: ContentRow['variants'][number], allVariants: ContentRow['variants'], masterRevision: number, hasMaster: boolean) {
  const ownAssets = variant.assetLinks.map((link) => ({ asset: mapAsset(link.asset), sortOrder: link.sortOrder }))
  const effectiveAssets = effectiveAssetLinks(variant, allVariants).map((link) => ({ asset: mapAsset(link.asset), sortOrder: link.sortOrder }))
  return {
    id: variant.id,
    platform: variant.platform,
    enabled: variant.enabled,
    copy: variant.copy,
    cta: variant.cta,
    hashtags: variant.hashtags,
    visualRecommendation: variant.visualRecommendation,
    revision: variant.revision,
    adaptationState: deriveAdaptationState({ ...variant, masterRevision, hasMaster }),
    reuseCreativeFromVariantId: variant.reuseCreativeFromVariant?.id ?? null,
    ownAssets,
    effectiveAssets,
    assessment: null,
    schedule: null,
    publication: null,
  }
}

function mapAsset(asset: ContentRow['variants'][number]['assetLinks'][number]['asset']) {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes),
    width: asset.width,
    height: asset.height,
    purpose: asset.purpose,
    contentUrl: `/api/assets/${asset.id}/content`,
    createdAt: asset.createdAt.toISOString(),
  }
}

function assertAdaptedPrerequisites(content: CompleteContentRow) {
  const master = decodeMaster(content.masterContent)
  if (!master) throw conflict('Master Content is required before editorial progress can continue.')
  const blocked = content.variants.filter((variant) => variant.enabled).find((variant) => deriveAdaptationState({ ...variant, masterRevision: content.masterRevision, hasMaster: true }) !== 'current')
  if (blocked) throw conflict('Every enabled platform needs a current complete adaptation before editorial progress can continue.')
}

function assertCreativePrerequisites(content: CompleteContentRow) {
  const blocked = content.variants.filter((variant) => variant.enabled).find((variant) => effectiveAssetLinks(variant, content.variants).length === 0)
  if (blocked) throw conflict('Every enabled platform needs an effective creative Asset before review can begin.')
}

function effectiveAssetLinks(variant: ContentRow['variants'][number], allVariants: ContentRow['variants']) {
  if (variant.platform === 'linkedin' && variant.reuseCreativeFromVariant) {
    return allVariants.find((candidate) => candidate.id === variant.reuseCreativeFromVariant?.id)?.assetLinks ?? []
  }
  return variant.assetLinks
}

function lifecycleFilter(value: string): Prisma.ContentWhereInput {
  const stages: Record<string, ContentStage> = {
    Draft: 'draft', Generated: 'generated', Adapted: 'adapted', 'Creative In Progress': 'creative_in_progress', 'Ready for Review': 'ready_for_review', 'Needs Revision': 'needs_revision',
  }
  if (value === 'Archived') return { archivedAt: { not: null } }
  const stage = stages[value]
  if (!stage) throw validationError('The lifecycle filter is invalid.', { lifecycleStatus: 'Choose an approved lifecycle status.' })
  return { archivedAt: null, editorialStage: stage }
}

function decodeMaster(value: Prisma.JsonValue | null): MasterInput | null {
  if (!isRecord(value)) return null
  const { title, coreMessage, hook, body, cta } = value
  if ([title, coreMessage, hook, body, cta].every((item) => typeof item === 'string')) return { title: title as string, coreMessage: coreMessage as string, hook: hook as string, body: body as string, cta: cta as string }
  throw conflict('Content persistence is invalid: Master Content has an unsupported shape.')
}

function decodeVisualDirection(value: Prisma.JsonValue | null): VisualDirectionInput | null {
  if (!isRecord(value)) return null
  const { format, concept, structure, notes } = value
  if (typeof format === 'string' && typeof concept === 'string' && Array.isArray(structure) && structure.every((item) => typeof item === 'string') && typeof notes === 'string') {
    return { format, concept, structure: structure as string[], notes }
  }
  throw conflict('Content persistence is invalid: Visual Direction has an unsupported shape.')
}

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function sameJson(value: Prisma.JsonValue | null, next: object | null) {
  if (next === null) return value === null
  return JSON.stringify(value) === JSON.stringify(next)
}

function sameBrief(content: CompleteContentRow, brief: BriefInput) {
  return content.contextType === brief.contextType
    && content.productId === brief.productId
    && content.brief.pillarCode === brief.pillarCode
    && content.brief.objective === brief.objective
    && content.brief.targetAudience === brief.targetAudience
    && content.brief.topic === brief.topic
    && content.brief.angle === brief.angle
    && content.brief.additionalInstructions === brief.additionalInstructions
}

function sameEnabledPlatforms(content: CompleteContentRow, platforms: PlatformCode[]) {
  const current = content.variants.filter((variant) => variant.enabled).map((variant) => variant.platform).sort()
  return JSON.stringify(current) === JSON.stringify([...platforms].sort())
}

function hasBrief(content: ContentRow): content is CompleteContentRow {
  return Boolean(content.brief)
}
