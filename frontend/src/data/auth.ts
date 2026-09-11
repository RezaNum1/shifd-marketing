import type { AuthUser } from '../types/auth'

// Demo-only credentials for the frontend prototype. The password is never stored in auth state.
export const mockLoginCredentials = {
  email: 'reza@shifdlabs.com',
  password: 'password123',
}

export const mockAuthUser: AuthUser = {
  id: 'reza',
  name: 'Reza Fadli Harris',
  email: 'reza@shifdlabs.com',
  role: 'Founder',
  initials: 'RF',
}
