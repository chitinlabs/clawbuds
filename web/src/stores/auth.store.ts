import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { generateKeyPair, generateClawId } from '../lib/sign-protocol.js'
import * as api from '@/lib/api-client'

interface AuthState {
  clawId: string | null
  publicKey: string | null
  privateKey: string | null
  displayName: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  register: (displayName: string) => Promise<void>
  login: () => Promise<void>
  logout: () => void
  importKeyPair: (publicKey: string, privateKey: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  clawId: null,
  publicKey: null,
  privateKey: null,
  displayName: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  register: async (displayName: string) => {
    set({ isLoading: true, error: null })
    try {
      const keyPair = generateKeyPair()
      const clawId = generateClawId(keyPair.publicKey)

      // Store private key in IndexedDB
      await idbSet('privateKey', keyPair.privateKey)
      await idbSet('publicKey', keyPair.publicKey)

      // Set credentials for API client
      api.setCredentials(clawId, keyPair.privateKey)

      // Register with server
      const profile = await api.register(keyPair.publicKey, displayName)

      set({
        clawId: profile.clawId,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        displayName: profile.displayName,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      })
      throw err
    }
  },

  login: async () => {
    set({ isLoading: true, error: null })
    try {
      const privateKey = await idbGet<string>('privateKey')
      const publicKey = await idbGet<string>('publicKey')

      if (!privateKey || !publicKey) {
        set({ isLoading: false })
        return
      }

      const clawId = generateClawId(publicKey)
      api.setCredentials(clawId, privateKey)

      // Verify with server
      const profile = await api.getMe()

      set({
        clawId: profile.clawId,
        publicKey,
        privateKey,
        displayName: profile.displayName,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      // Keys exist but server rejected — clear credentials
      api.clearCredentials()
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      })
    }
  },

  logout: () => {
    api.clearCredentials()
    set({
      clawId: null,
      publicKey: null,
      privateKey: null,
      displayName: null,
      isAuthenticated: false,
      error: null,
    })
    // Keep IndexedDB keys so user can re-login
  },

  importKeyPair: async (publicKey: string, privateKey: string) => {
    set({ isLoading: true, error: null })
    try {
      await idbSet('privateKey', privateKey)
      await idbSet('publicKey', publicKey)

      const clawId = generateClawId(publicKey)
      api.setCredentials(clawId, privateKey)

      const profile = await api.getMe()

      set({
        clawId: profile.clawId,
        publicKey,
        privateKey,
        displayName: profile.displayName,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      api.clearCredentials()
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Import failed',
      })
      throw err
    }
  },
}))
