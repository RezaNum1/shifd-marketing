import { describe, expect, it } from 'vitest'
import { normalizeCanvaDesignUrl } from '../src/modules/content/service.js'

describe('Canva design URL validation', () => {
  it('accepts and safely normalizes HTTPS Canva design URLs', () => {
    expect(normalizeCanvaDesignUrl('  https://WWW.CANVA.COM/design/DAGxYz_123/view?utm_content=campaign  '))
      .toBe('https://www.canva.com/design/DAGxYz_123/view?utm_content=campaign')
    expect(normalizeCanvaDesignUrl('https://canva.com/design/AbCd-123/edit')).toBe('https://canva.com/design/AbCd-123/edit')
  })

  it.each([
    'not a URL',
    '',
    'javascript:alert(1)',
    'http://www.canva.com/design/abc/view',
    'https://canva.com.evil.example/design/abc/view',
    'https://notcanva.com/design/abc/view',
    'https://www.canva.com/profile/user',
    'https://user:password@www.canva.com/design/abc/view',
    `https://www.canva.com/design/${'x'.repeat(2050)}/view`,
  ])('rejects unsupported or unsafe URL: %s', (value) => {
    expect(() => normalizeCanvaDesignUrl(value)).toThrow()
  })
})
