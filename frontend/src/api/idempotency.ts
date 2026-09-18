import { createRequestKey } from './client'

const pendingKeys = new Map<string, string>()

/**
 * Keeps a command key stable while an intentional command is retryable. The
 * caller removes it after a successful response or when the backend says the
 * command must be reconsidered (for example, INPUT_CHANGED).
 */
export function beginCommand(scope: string, fingerprint: string) {
  const identity = `${scope}|${fingerprint}`
  const existing = pendingKeys.get(identity)
  if (existing) return { identity, key: existing }
  const key = createRequestKey(scope)
  pendingKeys.set(identity, key)
  return { identity, key }
}

export function completeCommand(identity: string) {
  pendingKeys.delete(identity)
}

export function discardCommand(identity: string) {
  pendingKeys.delete(identity)
}

export function clearCommandKeys(...scopes: string[]) {
  if (!scopes.length) {
    pendingKeys.clear()
    return
  }
  for (const identity of pendingKeys.keys()) {
    if (scopes.some((scope) => identity.startsWith(`${scope}|`))) pendingKeys.delete(identity)
  }
}
