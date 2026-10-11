import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import { AppError, aiNotConfigured, aiOutputInvalid, notFound, validationError } from '../../shared/errors/AppError.js'
import { requestHash } from '../context/normalize.js'
import { AI_MODEL_ID, AI_PROVIDER, PROSPECT_EMAIL_DRAFT_OPERATION, PROSPECT_EMAIL_DRAFT_SCHEMA_VERSION } from '../ai/constants.js'
import { PROSPECT_EMAIL_DRAFT_SYSTEM_PROMPT, renderProspectEmailDraftPrompt } from '../ai/prospect-email-draft-prompt.js'
import { calculateCost, mapProviderFailure, usageForDb, type RateSelection } from '../ai/service.js'
import type { AiProvider, AiProviderResult } from '../ai/provider.js'

export const DRAFT_OBJECTIVES = ['introduce_shifd_labs', 'introduce_service', 'introduce_shifd_approval', 'explore_partnership', 'follow_up'] as const
export const DRAFT_OFFERINGS = ['custom_web_application', 'mobile_application', 'workflow_digitalization', 'it_consultation', 'shifd_approval'] as const
export const DRAFT_TONES = ['professional', 'consultative', 'friendly_professional', 'concise'] as const
export type DraftObjective = typeof DRAFT_OBJECTIVES[number]
export type DraftOffering = typeof DRAFT_OFFERINGS[number]
export type DraftTone = typeof DRAFT_TONES[number]

export interface DraftInput {
  subject: string
  body: string
  recipientName?: string | null
  recipientEmail?: string | null
  language?: 'English' | 'Indonesian'
  tone?: DraftTone
  objective?: DraftObjective
  offering?: DraftOffering
  origin?: 'manual' | 'ai'
  generationId?: string | null
  claimIds?: string[]
}

export interface GenerateInput {
  objective: DraftObjective
  offering: DraftOffering
  tone: DraftTone
  language: 'English' | 'Indonesian'
  customInstructions?: string
  claimIds: string[]
}

export async function eligibleResearchFacts(prisma: PrismaClient, companyId: string, prospectId: string) {
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId, archivedAt: null }, select: { id: true } })
  if (!prospect) throw notFound('Prospect not found.')
  const claims = await prisma.prospectResearchClaim.findMany({
    where: { claimType: 'sourced_fact', reviewStatus: 'approved', sources: { some: {} }, run: { companyId, prospectId, identityStatus: 'matched' } },
    include: { sources: { include: { source: { select: { id: true, title: true, domain: true, url: true } } } }, run: { select: { id: true, researchedAt: true } } },
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }], take: 50,
  })
  return claims.map((claim) => mapClaim(claim))
}

export async function generateProspectEmailDraft(prisma: PrismaClient, config: AppConfig, provider: AiProvider, companyId: string, actorId: string, prospectId: string, input: GenerateInput) {
  validateGenerateInput(input)
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId, archivedAt: null } })
  if (!prospect) throw notFound('Prospect not found.')
  const claims = await getEligibleClaims(prisma, companyId, prospectId, input.claimIds)
  const promptVersion = await prisma.promptVersion.findFirst({ where: { module: 'M2', operation: PROSPECT_EMAIL_DRAFT_OPERATION, status: 'active' } })
  if (!promptVersion) throw new AppError(503, 'OUTREACH_NOT_CONFIGURED', 'AI email drafting is not configured for this environment.')
  const settings = await prisma.aiSettings.findUnique({ where: { companyId }, select: { modelId: true } })
  const model = settings?.modelId ?? config.openaiModel ?? AI_MODEL_ID
  if (provider.isConfigured && !provider.isConfigured(model)) throw aiNotConfigured()
  const context = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, description: true, industry: true, website: true, mission: true, vision: true, positioning: true, coreValueProposition: true, differentiators: true, customerSegments: true } })
  const product = input.offering === 'shifd_approval' ? await prisma.product.findFirst({ where: { companyId, name: { contains: 'Shifd Approval', mode: 'insensitive' }, status: 'active' }, include: { profile: true } }) : null
  const safeClaims = claims.map((claim: { text: string; sources: Array<{ title: string; domain: string; url: string }> }) => ({ text: claim.text, evidence: claim.sources.map(({ title, domain, url }: { title: string; domain: string; url: string }) => ({ title, domain, url })) }))
  const snapshot = {
    prospectId,
    prospect: { name: prospect.name, industry: prospect.industry, website: prospect.website, address: prospect.address, contactName: prospect.contactName },
    company: context,
    offering: input.offering,
    product: product ? { name: product.name, description: product.description, category: product.category, profile: product.profile } : null,
    objective: input.objective, tone: input.tone, language: input.language,
    customInstructions: input.customInstructions?.trim() || null,
    selectedClaimIds: input.claimIds,
    approvedSourcedFacts: safeClaims,
  }
  const inputHash = requestHash(snapshot)
  const rate = await selectRate(prisma, model)
  const requestId = randomUUID()
  await prisma.aiRequestLog.create({ data: { id: requestId, companyId, requestedBy: actorId, promptVersionId: promptVersion.id, module: 'M2', operation: PROSPECT_EMAIL_DRAFT_OPERATION, provider: AI_PROVIDER, model, mode: 'real', language: input.language, inputHash, inputSnapshot: snapshot as Prisma.InputJsonValue, status: 'pending', costBasis: rate ? rate as unknown as Prisma.InputJsonValue : Prisma.DbNull } })
  const startedAt = Date.now()
  let result: AiProviderResult | null = null
  try {
    result = await provider.generate({ model, outputSchemaVersion: PROSPECT_EMAIL_DRAFT_SCHEMA_VERSION, systemPrompt: PROSPECT_EMAIL_DRAFT_SYSTEM_PROMPT, userPrompt: renderProspectEmailDraftPrompt(snapshot), maxOutputTokens: Math.min(config.aiMaxOutputTokens, 1800), timeoutMs: config.aiRequestTimeoutMs })
    const output = parseEmailOutput(result.text)
    const usage = usageForDb(result)
    await prisma.aiRequestLog.update({ where: { id: requestId }, data: { status: 'success', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimatedCostUsd: calculateCost(usage, rate), providerRequestId: result.providerRequestId } })
    return { subject: output.subject, body: output.body, generationId: requestId, claims, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } }
  } catch (error) {
    const failure = error instanceof AppError ? error : mapProviderFailure(error)
    await prisma.aiRequestLog.update({ where: { id: requestId }, data: { status: 'failed', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: result?.inputTokens ?? null, outputTokens: result?.outputTokens ?? null, providerRequestId: result?.providerRequestId ?? null, errorCode: failure.code, errorMessage: failure.message } })
    throw failure
  }
}

export async function createProspectEmailDraft(prisma: PrismaClient, companyId: string, actorId: string, prospectId: string, input: DraftInput) {
  validateDraftInput(input)
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId, archivedAt: null } })
  if (!prospect) throw notFound('Prospect not found.')
  validateRecipient(input, prospect)
  const origin = input.origin ?? (input.generationId ? 'ai' : 'manual')
  if ((origin === 'ai') !== Boolean(input.generationId)) throw validationError('AI drafts must be linked to their generation record, and manual drafts cannot reference one.')
  const claimIds = [...new Set(input.claimIds ?? [])]
  let claims: any[] = []
  if (claimIds.length) claims = await getEligibleClaims(prisma, companyId, prospectId, claimIds)
  if (origin === 'ai') {
    const log = await prisma.aiRequestLog.findFirst({ where: { id: input.generationId!, companyId, requestedBy: actorId, module: 'M2', operation: PROSPECT_EMAIL_DRAFT_OPERATION, status: 'success' } })
    const snapshot = log?.inputSnapshot as Record<string, any> | undefined
    const generatedClaimIds = Array.isArray(snapshot?.selectedClaimIds) ? snapshot!.selectedClaimIds : null
    if (!log || snapshot?.prospectId !== prospectId || !generatedClaimIds || claimIds.some((id) => !generatedClaimIds.includes(id)) || generatedClaimIds.some((id: string) => !claimIds.includes(id))) throw validationError('The AI generation record does not match this prospect and selected facts.')
  }
  const draft = await prisma.prospectEmailDraft.create({ data: {
    id: randomUUID(), companyId, prospectId, createdBy: actorId, aiRequestLogId: input.generationId ?? null,
    recipientName: input.recipientName?.trim() || null, recipientEmail: input.recipientEmail?.trim().toLowerCase() || null,
    subject: input.subject.trim(), body: input.body.trim(), language: input.language ?? 'English', tone: input.tone ?? 'professional',
    objective: input.objective ?? 'introduce_shifd_labs', offering: input.offering ?? 'custom_web_application', origin, status: 'draft',
    ...(claims.length ? { researchClaims: { create: claims.map((claim) => ({ claimId: claim.id })) } } : {}),
  } })
  return readProspectEmailDraft(prisma, companyId, prospectId, draft.id)
}

export async function listProspectEmailDrafts(prisma: PrismaClient, companyId: string, prospectId: string) {
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { id: true } })
  if (!prospect) throw notFound('Prospect not found.')
  const drafts = await prisma.prospectEmailDraft.findMany({ where: { companyId, prospectId, status: 'draft' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, subject: true, origin: true, status: true, language: true, createdAt: true, updatedAt: true } })
  return drafts.map((draft) => ({ ...draft, createdAt: draft.createdAt.toISOString(), updatedAt: draft.updatedAt.toISOString() }))
}

export async function readProspectEmailDraft(prisma: PrismaClient, companyId: string, prospectId: string, draftId: string) {
  const draft = await prisma.prospectEmailDraft.findFirst({
    where: { id: draftId, companyId, prospectId },
    include: {
      researchClaims: { include: { claim: { include: {
        sources: { include: { source: { select: { id: true, title: true, domain: true, url: true } } } },
        run: { select: { id: true, researchedAt: true } },
      } } } },
      aiRequestLog: { select: { id: true, model: true, provider: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true } },
    },
  })
  if (!draft) throw notFound('Email draft not found.')
  return {
    id: draft.id, prospectId: draft.prospectId, recipientName: draft.recipientName, recipientEmail: draft.recipientEmail,
    subject: draft.subject, body: draft.body, language: draft.language, tone: draft.tone, objective: draft.objective, offering: draft.offering,
    origin: draft.origin, status: draft.status, createdBy: draft.createdBy, createdAt: draft.createdAt.toISOString(), updatedAt: draft.updatedAt.toISOString(), version: draft.version,
    generation: draft.aiRequestLog ? { id: draft.aiRequestLog.id, provider: draft.aiRequestLog.provider, model: draft.aiRequestLog.model, inputTokens: draft.aiRequestLog.inputTokens?.toString() ?? null, outputTokens: draft.aiRequestLog.outputTokens?.toString() ?? null, estimatedCostUsd: draft.aiRequestLog.estimatedCostUsd?.toString() ?? null } : null,
    researchClaims: draft.researchClaims.map(({ claim }) => mapClaim(claim)),
  }
}

export async function updateProspectEmailDraft(prisma: PrismaClient, companyId: string, prospectId: string, draftId: string, actorId: string, input: { subject: string; body: string; recipientName?: string | null; recipientEmail?: string | null }) {
  if (!input || typeof input.subject !== 'string' || typeof input.body !== 'string' || !input.subject.trim() || input.subject.length > 500 || !input.body.trim() || input.body.length > 20000) throw validationError('Subject and body are required within the allowed length.')
  const draft = await prisma.prospectEmailDraft.findFirst({ where: { id: draftId, companyId, prospectId, status: 'draft' } })
  if (!draft) throw notFound('Email draft not found.')
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId } })
  if (!prospect) throw notFound('Prospect not found.')
  validateRecipient(input, prospect)
  await prisma.prospectEmailDraft.update({ where: { id: draft.id }, data: { subject: input.subject.trim(), body: input.body.trim(), recipientName: input.recipientName?.trim() || null, recipientEmail: input.recipientEmail?.trim().toLowerCase() || null, updatedAt: new Date(), version: { increment: 1 } } })
  void actorId
  return readProspectEmailDraft(prisma, companyId, prospectId, draftId)
}

export async function archiveProspectEmailDraft(prisma: PrismaClient, companyId: string, prospectId: string, draftId: string) {
  const draft = await prisma.prospectEmailDraft.findFirst({ where: { id: draftId, companyId, prospectId, status: 'draft' }, select: { id: true } })
  if (!draft) throw notFound('Email draft not found.')
  await prisma.prospectEmailDraft.update({ where: { id: draft.id }, data: { status: 'archived', archivedAt: new Date(), updatedAt: new Date(), version: { increment: 1 } } })
  return { id: draft.id, status: 'archived' as const }
}

export function parseEmailOutput(text: string) {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw aiOutputInvalid() }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw aiOutputInvalid()
  const value = parsed as Record<string, unknown>
  if (Object.keys(value).some((key) => !['subject', 'body'].includes(key)) || typeof value.subject !== 'string' || !value.subject.trim() || value.subject.length > 500 || typeof value.body !== 'string' || !value.body.trim() || value.body.length > 8000) throw aiOutputInvalid()
  return { subject: value.subject.trim(), body: value.body.trim() }
}

export function validateGenerateInput(input: GenerateInput) {
  if (!input || !DRAFT_OBJECTIVES.includes(input.objective) || !DRAFT_OFFERINGS.includes(input.offering) || !DRAFT_TONES.includes(input.tone) || !['English', 'Indonesian'].includes(input.language) || !Array.isArray(input.claimIds) || input.claimIds.length > 8 || input.claimIds.some((id) => typeof id !== 'string' || !isUuid(id)) || (input.customInstructions !== undefined && (typeof input.customInstructions !== 'string' || input.customInstructions.length > 1500))) throw validationError('The email generation options are invalid.')
}

async function getEligibleClaims(prisma: PrismaClient, companyId: string, prospectId: string, ids: string[]) {
  if (ids.length > 8 || ids.some((id) => !isUuid(id))) throw validationError('Select at most eight valid research facts.')
  const unique = [...new Set(ids)]
  if (unique.length !== ids.length) throw validationError('Duplicate research facts are not allowed.')
  if (!unique.length) return []
  const claims = await prisma.prospectResearchClaim.findMany({
    where: { id: { in: unique }, claimType: 'sourced_fact', reviewStatus: 'approved', sources: { some: {} }, run: { companyId, prospectId, identityStatus: 'matched' } },
    include: {
      sources: { include: { source: { select: { id: true, title: true, domain: true, url: true } } } },
      run: { select: { id: true, researchedAt: true } },
    },
  })
  if (claims.length !== unique.length) throw validationError('One or more selected facts are unavailable, unapproved, or belong to another prospect.')
  return claims.map(mapClaim)
}

function mapClaim(claim: any) { return { id: claim.id, text: claim.text, category: claim.category, claimType: claim.claimType, reviewStatus: claim.reviewStatus, reviewedAt: claim.reviewedAt?.toISOString() ?? null, runId: claim.run.id, researchedAt: claim.run.researchedAt.toISOString(), sources: claim.sources.map((link: any) => ({ ...link.source })) } }
function validateDraftInput(input: DraftInput) {
  if (!input || typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 500 || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 20000) throw validationError('Subject and body are required within the allowed length.')
  if (input.language !== undefined && !['English', 'Indonesian'].includes(input.language) || input.tone !== undefined && !DRAFT_TONES.includes(input.tone) || input.objective !== undefined && !DRAFT_OBJECTIVES.includes(input.objective) || input.offering !== undefined && !DRAFT_OFFERINGS.includes(input.offering) || input.origin !== undefined && !['manual', 'ai'].includes(input.origin)) throw validationError('Draft options are invalid.')
  if (input.claimIds !== undefined && (!Array.isArray(input.claimIds) || input.claimIds.length > 8 || input.claimIds.some((id) => typeof id !== 'string' || !isUuid(id)))) throw validationError('Research fact references are invalid.')
  if (input.generationId !== undefined && input.generationId !== null && (typeof input.generationId !== 'string' || !isUuid(input.generationId))) throw validationError('The generation reference is invalid.')
}
function validateRecipient(input: { recipientName?: string | null; recipientEmail?: string | null }, prospect: { contactName: string | null; contactEmail: string | null }) {
  if (input.recipientName !== undefined && input.recipientName !== null && (typeof input.recipientName !== 'string' || input.recipientName.length > 240)) throw validationError('Recipient name is invalid.')
  if (input.recipientEmail !== undefined && input.recipientEmail !== null && (typeof input.recipientEmail !== 'string' || input.recipientEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipientEmail))) throw validationError('Recipient email is invalid.')
  if (input.recipientName && input.recipientName !== prospect.contactName || input.recipientEmail && input.recipientEmail.toLowerCase() !== prospect.contactEmail?.toLowerCase()) throw validationError('Recipient must match a contact saved on this prospect.')
}
function isUuid(value: string) { return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) }
function toJson(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
async function selectRate(prisma: PrismaClient, model: string): Promise<RateSelection | null> {
  const row = await prisma.aiRateVersion.findFirst({ where: { provider: AI_PROVIDER, model, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' } })
  return row ? { id: row.id, version: row.version, inputUsdPerMillion: row.inputUsdPerMillion.toString(), outputUsdPerMillion: row.outputUsdPerMillion.toString() } : null
}
