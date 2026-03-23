import { apiFetch } from '@/shared/api/client'
import { clearStoredToken, getStoredToken, setStoredToken } from '@/shared/lib/auth-token'
import { defineStore } from 'pinia'

export type AuthUser = {
  id: string
  phone: string
  username: string | null
  firstName: string | null
  lastName: string | null
}

type LoginResponse = { accessToken: string; user: AuthUser }

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as AuthUser | null,
    ready: false,
  }),
  getters: {
    isAuthenticated: (s) => Boolean(s.accessToken && s.user),
  },
  actions: {
    restoreFromStorage() {
      this.accessToken = getStoredToken()
    },
    setSession(token: string, user: AuthUser) {
      this.accessToken = token
      this.user = user
      setStoredToken(token)
    },
    clearSession() {
      this.accessToken = null
      this.user = null
      clearStoredToken()
    },
    async hydrate() {
      this.restoreFromStorage()
      if (!this.accessToken) {
        this.ready = true
        return
      }
      try {
        const res = await apiFetch('/auth/me')
        this.user = (await res.json()) as AuthUser
      } catch {
        this.clearSession()
      } finally {
        this.ready = true
      }
    },
    async login(phone: string, password: string) {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      })
      const data = (await res.json()) as LoginResponse
      this.setSession(data.accessToken, data.user)
    },
    async register(
      phone: string,
      username: string,
      firstName: string,
      lastName: string,
      password: string,
    ) {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          username,
          firstName,
          lastName,
          password,
        }),
      })
      const data = (await res.json()) as LoginResponse
      this.setSession(data.accessToken, data.user)
    },
    logout() {
      this.clearSession()
    },
  },
})
