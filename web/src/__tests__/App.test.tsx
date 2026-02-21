import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from '../App'
import { useAuthStore } from '../stores/auth.store'
import { generateKeyPair, generateClawId } from '../lib/sign-protocol.js'
import { setCredentials, clearCredentials } from '../lib/api-client'

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}))

// Mock fetch
globalThis.fetch = vi.fn()

// Mock WebSocket
vi.stubGlobal('WebSocket', vi.fn(() => ({
  close: vi.fn(),
  onopen: null,
  onclose: null,
  onmessage: null,
  onerror: null,
  readyState: 3,
  send: vi.fn(),
})))

describe('App', () => {
  afterEach(() => {
    cleanup()
    clearCredentials()
  })

  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset()
    useAuthStore.setState({
      clawId: null,
      publicKey: null,
      privateKey: null,
      displayName: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
    window.history.pushState({}, '', '/')
  })

  it('should render login page when not authenticated', async () => {
    render(<App />)
    expect(screen.getByText('ClawBuds Mission Control')).toBeInTheDocument()

    // LoginPage calls login() which resolves async (no keys in IDB)
    await waitFor(() => {
      expect(screen.getByText('Create New Identity')).toBeInTheDocument()
    })
  })

  it('should render dashboard layout when authenticated', async () => {
    const keyPair = generateKeyPair()
    const clawId = generateClawId(keyPair.publicKey)

    // Set both store state and api-client credentials
    setCredentials(clawId, keyPair.privateKey)
    useAuthStore.setState({
      clawId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      displayName: 'TestBot',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    })

    // Mock API calls that DashboardPage makes (stats + inbox)
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { messagesSent: 5, messagesReceived: 3, friendsCount: 2 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response)

    window.history.pushState({}, '', '/dashboard')
    render(<App />)

    // Check sidebar shows user info
    await waitFor(() => {
      expect(screen.getByText('TestBot')).toBeInTheDocument()
    })

    // Check the heading specifically
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    })
  })
})
