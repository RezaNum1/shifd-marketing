import { beforeEach, describe, expect, it } from 'vitest'
import { beginCommand, clearCommandKeys, completeCommand, discardCommand } from './idempotency'

describe('command idempotency keys', () => {
  beforeEach(() => clearCommandKeys())

  it('reuses a key for the same pending intent and creates a new key after completion', () => {
    const first = beginCommand('content.generate', 'content-1|4')
    expect(beginCommand('content.generate', 'content-1|4').key).toBe(first.key)
    completeCommand(first.identity)
    expect(beginCommand('content.generate', 'content-1|4').key).not.toBe(first.key)
  })

  it('clears a command key when the backend says the intent must be reconsidered', () => {
    const first = beginCommand('content.adapt', 'content-1|instagram|4')
    discardCommand(first.identity)
    const retry = beginCommand('content.adapt', 'content-1|instagram|4')
    expect(retry.key).not.toBe(first.key)
  })
})
