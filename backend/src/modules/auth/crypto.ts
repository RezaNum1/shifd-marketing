import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function tokensMatch(rawToken: string, storedHash: string): boolean {
  const actual = Buffer.from(hashToken(rawToken), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
