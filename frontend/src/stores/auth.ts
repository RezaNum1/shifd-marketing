import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '../api/auth'
import { isApiError, errorMessage } from '../api/client'
import { authUser } from '../api/normalizers'
import type { AuthUser } from '../types/auth'

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const status = ref<AuthStatus>('idle')
  const error = ref('')
  let bootstrapPromise: Promise<boolean> | null = null

  const isAuthenticated = computed(() => status.value === 'authenticated' && Boolean(user.value))
  const isLoading = computed(() => status.value === 'loading')

  async function bootstrap() {
    if (status.value === 'authenticated') return true
    if (bootstrapPromise) return bootstrapPromise
    status.value = 'loading'
    error.value = ''
    bootstrapPromise = authApi.me().then((result) => {
      user.value = authUser(result.data.user)
      status.value = 'authenticated'
      return true
    }).catch((reason: unknown) => {
      user.value = null
      if (isApiError(reason) && reason.status === 401) {
        status.value = 'unauthenticated'
        error.value = ''
      } else {
        status.value = 'error'
        error.value = errorMessage(reason, 'Unable to verify the current session.')
      }
      return false
    }).finally(() => {
      bootstrapPromise = null
    })
    return bootstrapPromise
  }

  async function login(email: string, password: string) {
    status.value = 'loading'
    error.value = ''
    try {
      const result = await authApi.login(email.trim(), password)
      user.value = authUser(result.data.user)
      status.value = 'authenticated'
      return true
    } catch (reason: unknown) {
      user.value = null
      status.value = 'unauthenticated'
      error.value = errorMessage(reason, 'Unable to sign in.')
      return false
    }
  }

  async function logout() {
    status.value = 'loading'
    try { await authApi.logout() } catch { /* local auth state is still cleared */ }
    user.value = null
    status.value = 'unauthenticated'
    error.value = ''
  }

  return { user, status, error, isAuthenticated, isLoading, bootstrap, login, logout }
})
