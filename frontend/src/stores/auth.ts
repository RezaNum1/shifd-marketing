import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mockAuthUser, mockLoginCredentials } from '../data/auth'
import type { AuthUser } from '../types/auth'

const SESSION_KEY = 'shifd.mock.auth.user'

function readSessionUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY)
    return value ? JSON.parse(value) as AuthUser : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(readSessionUser())
  const isAuthenticated = computed(() => Boolean(user.value))

  function login(email: string, password: string) {
    const valid = email.trim().toLowerCase() === mockLoginCredentials.email && password === mockLoginCredentials.password
    if (!valid) return false
    user.value = { ...mockAuthUser }
    try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(user.value)) } catch { /* session storage may be unavailable */ }
    return true
  }

  function logout() {
    user.value = null
    try { window.sessionStorage.removeItem(SESSION_KEY) } catch { /* session storage may be unavailable */ }
  }

  return { user, isAuthenticated, login, logout }
})
