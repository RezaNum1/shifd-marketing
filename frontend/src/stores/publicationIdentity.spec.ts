import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentLibraryStore } from './contentLibrary'

describe('publication identity and lifecycle status', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('updates one platform publication idempotently', () => {
    const library = useContentLibraryStore()
    const id = 'content-digital-approval'
    const before = library.publicationRecords.length
    const publication = { publishedAt: '2026-09-12T10:00:00' }
    expect(library.markPublished(id, 'instagram', publication)).toBe(true)
    expect(library.markPublished(id, 'instagram', { ...publication, publishedAt: '2026-09-12T10:05:00' })).toBe(true)
    expect(library.publicationRecords.length).toBe(before + 1)
    const record = library.records.find((item) => item.id === id)!
    expect(record.status).toBe('Scheduled')
    expect(record.lifecycle?.status).toBe('Scheduled')
  })

  it('derives Published only after all enabled platforms are published', () => {
    const library = useContentLibraryStore()
    const id = 'content-digital-approval'
    library.markPublished(id, 'instagram', { publishedAt: '2026-09-12T10:00:00' })
    library.markPublished(id, 'linkedin', { publishedAt: '2026-09-12T14:00:00' })
    expect(library.records.find((item) => item.id === id)?.lifecycle?.status).toBe('Published')
  })
})
