import { describe, expect, it } from 'vitest'
import { createStoredZip } from './canvaReadyExport'

describe('Canva-ready local ZIP', () => {
  it('creates a valid stored ZIP containing only supplied native layers', async () => {
    const zip = createStoredZip([
      { name: 'assets/background.svg', data: new TextEncoder().encode('<svg><path d="M0 0"/></svg>') },
      { name: 'typography.json', data: new TextEncoder().encode('{"headline":"Editable"}') },
    ])
    const bytes = new Uint8Array(await zip.arrayBuffer())
    const text = new TextDecoder().decode(bytes)
    expect(zip.type).toBe('application/zip')
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(text).toContain('assets/background.svg')
    expect(text).toContain('<svg><path d="M0 0"/></svg>')
    expect(text).toContain('typography.json')
    expect(text).not.toContain('base64,')
    expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06])
  })
})
