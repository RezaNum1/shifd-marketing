import type { PrismaClient } from '@prisma/client'
import { notFound, validationError } from '../../shared/errors/AppError.js'

export const OUTBOUND_ACTIVITY_TYPES = ['email_sent', 'follow_up', 'reply_received', 'meeting', 'product_demonstration', 'other'] as const
export const OUTBOUND_PROVENANCE = ['historical', 'artifact_assisted', 'non_artifact_assisted'] as const
export const RESPONSE_CLASSIFICATIONS = ['interested', 'not_interested', 'requested_information', 'follow_up_requested', 'meeting_requested', 'other'] as const
export type OutboundActivityType = typeof OUTBOUND_ACTIVITY_TYPES[number]
export type OutboundProvenance = typeof OUTBOUND_PROVENANCE[number]

type ActivityInput = {
  activityType: OutboundActivityType
  occurredAt: Date | undefined
  dueAt: Date | undefined
  status: 'scheduled' | 'completed' | undefined
  emailDraftId: string | null | undefined
  contactName: string | null
  contactEmail: string | null
  subject: string | null
  description: string | null
  responseClassification: typeof RESPONSE_CLASSIFICATIONS[number] | null
  provenance: OutboundProvenance
  notes: string | null
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError('An activity object is required.')
  return value as Record<string, unknown>
}
function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw validationError(`${field} is required.`)
    return null
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw validationError(`${field} is invalid.`)
  return value.trim() || null
}
function timestamp(value: unknown, field: string, required = false): Date | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw validationError(`${field} is required.`)
    return undefined
  }
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw validationError(`${field} must be an ISO timestamp with a timezone.`)
  const result = new Date(value)
  if (!Number.isFinite(result.getTime())) throw validationError(`${field} is invalid.`)
  return result
}

export function validateActivityInput(value: unknown): ActivityInput {
  const input = record(value)
  const allowed = ['activityType', 'occurredAt', 'dueAt', 'status', 'emailDraftId', 'contactName', 'contactEmail', 'subject', 'description', 'responseClassification', 'provenance', 'notes']
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw validationError('The activity contains unsupported fields.')
  if (!OUTBOUND_ACTIVITY_TYPES.includes(input.activityType as OutboundActivityType)) throw validationError('Activity type is not supported.')
  if (!OUTBOUND_PROVENANCE.includes(input.provenance as OutboundProvenance)) throw validationError('Choose an activity provenance.')
  if (input.emailDraftId !== undefined && input.emailDraftId !== null && (typeof input.emailDraftId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.emailDraftId))) throw validationError('Email draft reference is invalid.')
  if (input.emailDraftId && input.activityType !== 'email_sent') throw validationError('Only sent email activities can link a draft.')
  if (input.responseClassification !== undefined && input.responseClassification !== null && !RESPONSE_CLASSIFICATIONS.includes(input.responseClassification as typeof RESPONSE_CLASSIFICATIONS[number])) throw validationError('Response classification is not supported.')
  const type = input.activityType as OutboundActivityType
  const occurredAt = timestamp(input.occurredAt, 'Event date', type !== 'follow_up')
  const dueAt = timestamp(input.dueAt, 'Follow-up date', type === 'follow_up')
  if (type === 'follow_up' && (input.status !== undefined || occurredAt)) throw validationError('A new follow-up must be pending and has no completion date.')
  if (type !== 'follow_up' && dueAt) throw validationError('Only follow-ups have a due date.')
  if (type === 'meeting' || type === 'product_demonstration') {
    if (input.status !== undefined && input.status !== 'scheduled' && input.status !== 'completed') throw validationError('Meeting status is invalid.')
  } else if (input.status !== undefined) throw validationError('Status can only be set for a meeting or demonstration.')
  if ((type === 'reply_received') !== Boolean(input.responseClassification)) throw validationError('Replies require a response classification; other activities cannot have one.')
  const subject = text(input.subject, 'Subject', 500, type === 'email_sent')
  const description = text(input.description, 'Description', 1000, type === 'other')
  if (subject && type !== 'email_sent') throw validationError('Only sent email activities can have an email subject.')
  if (description && type !== 'other') throw validationError('Only other interactions can have a description.')
  const contactEmail = text(input.contactEmail, 'Contact email', 320)
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw validationError('Contact email is invalid.')
  return {
    activityType: type, occurredAt, dueAt, status: input.status as ActivityInput['status'],
    emailDraftId: input.emailDraftId as string | null | undefined,
    contactName: text(input.contactName, 'Contact name', 160), contactEmail,
    subject, description, responseClassification: input.responseClassification as ActivityInput['responseClassification'],
    provenance: input.provenance as OutboundProvenance, notes: text(input.notes, 'Notes', 5000),
  }
}

export function calculateOutreachSummary(rows: Array<{ activityType: string; status: string; responseClassification: string | null; occurredAt: Date | null; dueAt: Date | null }>, now = new Date()) {
  const actual = rows.filter((row) => row.activityType !== 'follow_up' && row.status !== 'cancelled' && row.status !== 'scheduled')
  const times = actual.map((row) => row.occurredAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())
  const pending = rows.filter((row) => row.activityType === 'follow_up' && row.status === 'pending')
  return {
    emailsSent: rows.filter((row) => row.activityType === 'email_sent' && row.status === 'recorded').length,
    followUpsCompleted: rows.filter((row) => row.activityType === 'follow_up' && row.status === 'completed').length,
    repliesReceived: rows.filter((row) => row.activityType === 'reply_received' && row.status === 'recorded').length,
    interestedResponses: rows.filter((row) => row.activityType === 'reply_received' && row.responseClassification === 'interested').length,
    meetings: rows.filter((row) => row.activityType === 'meeting' && row.status !== 'cancelled').length,
    demonstrations: rows.filter((row) => row.activityType === 'product_demonstration' && row.status !== 'cancelled').length,
    pendingFollowUps: pending.length,
    overdueFollowUps: pending.filter((row) => row.dueAt && row.dueAt.getTime() < now.getTime()).length,
    lastInteractionAt: times[0]?.toISOString() ?? null,
  }
}

export function activityStateTransition(activityType: string, currentStatus: string, action: 'complete' | 'cancel', at: Date) {
  const allowed = (activityType === 'follow_up' && currentStatus === 'pending') || (['meeting', 'product_demonstration'].includes(activityType) && currentStatus === 'scheduled')
  if (!allowed) throw validationError('Only pending follow-ups and scheduled meetings or demonstrations can change status.')
  const status = action === 'complete' ? 'completed' : 'cancelled'
  return { status, completedAt: action === 'complete' ? at : null, occurredAt: action === 'complete' ? at : null }
}

const include = { creator: { select: { name: true } }, emailDraft: { select: { id: true, subject: true, origin: true, status: true } } } as const
function mapActivity(row: any) {
  return { ...row, occurredAt: row.occurredAt?.toISOString() ?? null, dueAt: row.dueAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null, creator: row.creator, emailDraft: row.emailDraft }
}

export async function createOutboundActivity(prisma: PrismaClient, companyId: string, prospectId: string, actorId: string, input: ActivityInput) {
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId, archivedAt: null }, select: { id: true, contactName: true, contactEmail: true } })
  if (!prospect) throw notFound('Prospect not found.')
  if ((input.contactName && input.contactName !== prospect.contactName) || (input.contactEmail && input.contactEmail !== prospect.contactEmail)) throw validationError('The selected contact must match the prospect’s saved contact information.')
  if (input.emailDraftId) {
    const draft = await prisma.prospectEmailDraft.findFirst({ where: { id: input.emailDraftId, companyId, prospectId, status: 'draft' }, select: { id: true } })
    if (!draft) throw notFound('Email draft not found for this prospect.')
  }
  const isFollowUp = input.activityType === 'follow_up'
  const isMeeting = input.activityType === 'meeting' || input.activityType === 'product_demonstration'
  const created = await prisma.outboundActivity.create({ data: {
    companyId, prospectId, createdBy: actorId, activityType: input.activityType,
    status: isFollowUp ? 'pending' : isMeeting ? input.status ?? 'completed' : 'recorded',
    occurredAt: input.occurredAt ?? null, dueAt: input.dueAt ?? null,
    completedAt: isMeeting && (input.status ?? 'completed') === 'completed' ? input.occurredAt ?? null : null,
    emailDraftId: input.emailDraftId ?? null, contactName: input.contactName ?? null, contactEmail: input.contactEmail ?? null,
    subject: input.subject ?? null, description: input.description ?? null, responseClassification: input.responseClassification ?? null,
    provenance: input.provenance, notes: input.notes ?? null,
  }, include })
  return mapActivity(created)
}

export async function listOutboundActivities(prisma: PrismaClient, companyId: string, prospectId: string, page = 1, limit = 100) {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw validationError('Pagination values are invalid.')
  if (!await prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { id: true } })) throw notFound('Prospect not found.')
  const where = { companyId, prospectId, archivedAt: null }
  const [rows, total] = await Promise.all([
    prisma.outboundActivity.findMany({ where, include, orderBy: [{ occurredAt: 'desc' }, { dueAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.outboundActivity.count({ where }),
  ])
  return { data: rows.map(mapActivity), page: { number: page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function readOutboundActivity(prisma: PrismaClient, companyId: string, prospectId: string, activityId: string) {
  const row = await prisma.outboundActivity.findFirst({ where: { id: activityId, companyId, prospectId, archivedAt: null }, include })
  if (!row) throw notFound('Outbound activity not found.')
  return mapActivity(row)
}

export async function updateOutboundActivity(prisma: PrismaClient, companyId: string, prospectId: string, activityId: string, actorId: string, value: unknown) {
  const row = await prisma.outboundActivity.findFirst({ where: { id: activityId, companyId, prospectId, archivedAt: null } })
  if (!row) throw notFound('Outbound activity not found.')
  const input = record(value)
  const allowed = ['occurredAt', 'dueAt', 'contactName', 'contactEmail', 'subject', 'description', 'responseClassification', 'provenance', 'notes']
  if (Object.keys(input).some((key) => !allowed.includes(key)) || !Object.keys(input).length) throw validationError('Only event details can be edited.')
  const date = input.occurredAt === undefined ? row.occurredAt : timestamp(input.occurredAt, 'Event date', row.activityType !== 'follow_up') ?? null
  if (row.activityType === 'follow_up' && row.status === 'completed' && input.occurredAt !== undefined) throw validationError('A completed follow-up date is preserved.')
  if (input.occurredAt !== undefined && row.activityType === 'follow_up') throw validationError('Follow-up completion dates are preserved.')
  const dueAt = input.dueAt === undefined ? row.dueAt : timestamp(input.dueAt, 'Follow-up date', true)
  if (input.dueAt !== undefined && (row.activityType !== 'follow_up' || row.status !== 'pending')) throw validationError('Only pending follow-ups can have their due date edited.')
  const response = input.responseClassification === undefined ? row.responseClassification : input.responseClassification
  if (row.activityType === 'reply_received' && !RESPONSE_CLASSIFICATIONS.includes(response as typeof RESPONSE_CLASSIFICATIONS[number])) throw validationError('Reply classification is invalid.')
  if (input.subject !== undefined && row.activityType !== 'email_sent') throw validationError('Only sent email activities can have an email subject.')
  if (input.description !== undefined && row.activityType !== 'other') throw validationError('Only other interactions can have a description.')
  if (input.provenance !== undefined && !OUTBOUND_PROVENANCE.includes(input.provenance as OutboundProvenance)) throw validationError('Activity provenance is invalid.')
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { contactName: true, contactEmail: true } })
  if (!prospect || (input.contactName !== undefined && input.contactName !== null && input.contactName !== prospect.contactName) || (input.contactEmail !== undefined && input.contactEmail !== null && input.contactEmail !== prospect.contactEmail)) throw validationError('The selected contact must match the prospect’s saved contact information.')
  const data: Record<string, unknown> = { updatedBy: actorId }
  if (input.occurredAt !== undefined) { data.occurredAt = date; if (row.activityType === 'meeting' || row.activityType === 'product_demonstration') data.completedAt = row.status === 'completed' ? date : null }
  if (input.dueAt !== undefined) data.dueAt = dueAt
  if (input.contactName !== undefined) data.contactName = text(input.contactName, 'Contact name', 160)
  if (input.contactEmail !== undefined) {
    const value = text(input.contactEmail, 'Contact email', 320)
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw validationError('Contact email is invalid.')
    data.contactEmail = value
  }
  if (input.subject !== undefined) data.subject = text(input.subject, 'Subject', 500, row.activityType === 'email_sent')
  if (input.description !== undefined) data.description = text(input.description, 'Description', 1000, row.activityType === 'other')
  if (input.responseClassification !== undefined) data.responseClassification = input.responseClassification
  if (input.provenance !== undefined) data.provenance = input.provenance
  if (input.notes !== undefined) data.notes = text(input.notes, 'Notes', 5000)
  const updated = await prisma.outboundActivity.update({ where: { id: row.id }, data: data as any, include })
  return mapActivity(updated)
}

export async function changeActivityState(prisma: PrismaClient, companyId: string, prospectId: string, activityId: string, actorId: string, action: 'complete' | 'cancel', completedAt = new Date()) {
  const row = await prisma.outboundActivity.findFirst({ where: { id: activityId, companyId, prospectId, archivedAt: null } })
  if (!row) throw notFound('Outbound activity not found.')
  const transition = activityStateTransition(row.activityType, row.status, action, completedAt)
  const updated = await prisma.outboundActivity.update({ where: { id: row.id }, data: { ...transition, occurredAt: action === 'complete' ? completedAt : row.occurredAt, updatedBy: actorId }, include })
  return mapActivity(updated)
}

export async function archiveOutboundActivity(prisma: PrismaClient, companyId: string, prospectId: string, activityId: string, actorId: string) {
  const row = await prisma.outboundActivity.findFirst({ where: { id: activityId, companyId, prospectId, archivedAt: null }, select: { id: true } })
  if (!row) throw notFound('Outbound activity not found.')
  return prisma.outboundActivity.update({ where: { id: row.id }, data: { archivedAt: new Date(), archivedBy: actorId, updatedBy: actorId } }).then(mapActivity)
}

export async function getOutboundSummary(prisma: PrismaClient, companyId: string, prospectId: string, now = new Date()) {
  if (!await prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { id: true } })) throw notFound('Prospect not found.')
  const rows = await prisma.outboundActivity.findMany({ where: { companyId, prospectId, archivedAt: null }, select: { activityType: true, status: true, responseClassification: true, occurredAt: true, dueAt: true } })
  return calculateOutreachSummary(rows, now)
}

export function parseActivityTimestamp(value: unknown, field = 'Completion date') { return timestamp(value, field, true)! }
