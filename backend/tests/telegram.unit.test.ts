import { describe, expect, it } from 'vitest'
import { explicitSavePhrase, parseUpdate, verifyTelegramSecret } from '../src/modules/integrations/telegram/service.js'

describe('Telegram conversational ideation boundaries', () => {
  it('uses constant-time secret comparison semantics and rejects missing values', () => {
    expect(verifyTelegramSecret('secret', 'secret')).toBe(true)
    expect(verifyTelegramSecret('secret', 'wrong')).toBe(false)
    expect(verifyTelegramSecret(undefined, 'secret')).toBe(false)
    expect(verifyTelegramSecret('secret', undefined)).toBe(false)
  })

  it('recognizes only explicit save phrases', () => {
    expect(explicitSavePhrase('Save this idea')).toBe(true)
    expect(explicitSavePhrase('Simpan ide ini!')).toBe(true)
    expect(explicitSavePhrase('save the campaign')).toBe(false)
    expect(explicitSavePhrase('this is a good idea')).toBe(false)
  })

  it('requires a Telegram update id and a supported update payload', () => {
    expect(parseUpdate({ update_id: 42, message: {} }).update_id).toBe(42)
    expect(() => parseUpdate({ message: {} })).toThrow('Telegram Update is invalid.')
    expect(() => parseUpdate({ update_id: 42 })).toThrow('Telegram Update is invalid.')
  })
})
