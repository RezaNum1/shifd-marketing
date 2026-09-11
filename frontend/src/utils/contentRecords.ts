import type {
  ContentLifecycleState,
  ContentLibraryRecord,
  ContentPlatform,
} from '../types/content'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function legacyLifecycle(record: ContentLibraryRecord): ContentLifecycleState {
  return {
    status: record.status,
    workflowStep: record.workflowStep,
    schedules: clone(record.details.schedules ?? {}),
    publications: clone(record.details.publications ?? {}),
  }
}

/**
 * Converts seed/legacy records into the current canonical lifecycle shape.
 * The compatibility fields are written from this shape in one place so views
 * never need to reconcile two independently mutable copies.
 */
export function normalizeContentRecord(record: ContentLibraryRecord): ContentLibraryRecord {
  const lifecycle = clone(record.lifecycle ?? legacyLifecycle(record))
  const firstSchedule = Object.values(lifecycle.schedules)[0]
  const firstPublication = Object.values(lifecycle.publications)[0]
  return {
    ...record,
    lifecycle,
    status: lifecycle.status,
    workflowStep: lifecycle.workflowStep,
    scheduleDate: firstSchedule?.date,
    scheduleTime: firstSchedule?.time,
    publishedAt: firstPublication?.publishedAt,
    details: {
      ...record.details,
      schedules: lifecycle.schedules,
      publications: lifecycle.publications,
    },
  }
}

export function contentLifecycle(record: ContentLibraryRecord): ContentLifecycleState {
  return record.lifecycle ?? legacyLifecycle(record)
}

export function contentStatus(record: ContentLibraryRecord) {
  return contentLifecycle(record).status
}

export function contentSchedules(record: ContentLibraryRecord) {
  return contentLifecycle(record).schedules
}

export function contentPublications(record: ContentLibraryRecord) {
  return contentLifecycle(record).publications
}

/** Apply a lifecycle mutation and refresh only the legacy display mirrors. */
export function setContentLifecycle(
  record: ContentLibraryRecord,
  lifecycle: ContentLifecycleState,
) {
  const normalized = normalizeContentRecord({ ...record, lifecycle })
  Object.assign(record, normalized)
}

export function platformHasPublication(record: ContentLibraryRecord, platform: ContentPlatform) {
  return Boolean(contentPublications(record)[platform])
}
