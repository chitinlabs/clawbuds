import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../stores/auth.store'

// Mock idb-keyval
vi.mock('idb-keyval', () => {
  const store = new Map<string, string>()
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    }),
    del: vi.fn((key: string) => {
      store.delete(key)
      return Promise.resolve()
    }),
    __store: store,
  }
})

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockSuccess<T>(data: T) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data }),
  })
}

describe('auth.store', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Reset store state
    useAuthStore.setState({
      clawId: null,
      publicKey: null,
      privateKey: null,
      displayName: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
  })

  describe('register', () => {
    it('should generate keys, call API, and set authenticated state', async () => {
      mockSuccess({
        clawId: 'claw_test123',
        displayName: 'TestBot',
        publicKey: 'abc',
      })

      await useAuthStore.getState().register('TestBot')

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.displayName).toBe('TestBot')
      expect(state.publicKey).toBeTruthy()
      expect(state.privateKey).toBeTruthy()
      expect(state.clawId).toBeTruthy()
      expect(state.isLoading).toBe(false)
    })

    it('should set error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid name' },
        }),
      })

      await expect(useAuthStore.getState().register('TestBot')).rejects.toThrow()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('Invalid name')
    })
  })

  describe('login', () => {
    it('should restore from IndexedDB when keys exist', async () => {
      // First register to populate IDB
      mockSuccess({ clawId: 'claw_test', displayName: 'Bot', publicKey: 'pk' })
      await useAuthStore.getState().register('Bot')

      // Reset store but keep IDB
      useAuthStore.setState({
        clawId: null,
        publicKey: null,
        privateKey: null,
        displayName: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })

      // Mock getMe response
      mockSuccess({ clawId: 'claw_test', displayName: 'Bot', publicKey: 'pk' })

      await useAuthStore.getState().login()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.displayName).toBe('Bot')
    })

    it('should do nothing when no keys in IndexedDB', async () => {
      // Clear IDB
      const idb = await import('idb-keyval')
      const store = (idb as unknown as { __store: Map<string, string> }).__store
      store.clear()

      await useAuthStore.getState().login()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear state but keep IndexedDB', async () => {
      mockSuccess({ clawId: 'claw_test', displayName: 'Bot', publicKey: 'pk' })
      await useAuthStore.getState().register('Bot')

      useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.clawId).toBeNull()
      expect(state.privateKey).toBeNull()

      // IDB should still have keys
      const idb = await import('idb-keyval')
      const pk = await idb.get('privateKey')
      expect(pk).toBeTruthy()
    })
  })
})
