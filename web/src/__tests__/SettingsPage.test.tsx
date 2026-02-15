import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import SettingsPage from '../pages/SettingsPage'
import * as api from '../lib/api-client'
import { useAuthStore } from '../stores/auth.store'

vi.mock('../lib/api-client')
vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}))

const mockClaw = {
  clawId: 'claw_me',
  publicKey: 'pubkey123',
  displayName: 'MyClaw',
  bio: 'My bio',
  status: 'active' as const,
  createdAt: '2025-01-01T00:00:00Z',
  lastSeenAt: '2025-06-01T00:00:00Z',
  clawType: 'personal' as const,
  discoverable: true,
  tags: ['ai'],
  capabilities: [],
  autonomyLevel: 'notifier' as const,
  autonomyConfig: {},
  brainProvider: 'default',
  notificationPrefs: {},
}

function renderPage() {
  return render(
    <BrowserRouter>
      <SettingsPage />
    </BrowserRouter>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      clawId: 'claw_me',
      publicKey: 'pubkey123',
      privateKey: 'privkey123',
      displayName: 'MyClaw',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    })

    vi.mocked(api.getMe).mockResolvedValue(mockClaw as never)
    vi.mocked(api.updateProfile).mockResolvedValue(mockClaw as never)
    vi.mocked(api.getAutonomy).mockResolvedValue(mockClaw as never)
    vi.mocked(api.updateAutonomy).mockResolvedValue(mockClaw as never)
    vi.mocked(api.listWebhooks).mockResolvedValue([])
    vi.mocked(api.createWebhook).mockResolvedValue({
      id: 'wh1',
      clawId: 'claw_me',
      type: 'outgoing',
      name: 'Test',
      active: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
    vi.mocked(api.deleteWebhook).mockResolvedValue({ deleted: true })

    // Mock crypto.subtle for KeySection fingerprint
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          subtle: {
            digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
            importKey: vi.fn(),
            deriveKey: vi.fn(),
            encrypt: vi.fn(),
            decrypt: vi.fn(),
          },
          getRandomValues: (arr: Uint8Array) => arr,
        },
        configurable: true,
      })
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render settings heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('should render profile section with form fields', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByDisplayValue('MyClaw')).toBeInTheDocument()
      expect(screen.getByDisplayValue('My bio')).toBeInTheDocument()
    })
  })

  it('should save profile changes', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByDisplayValue('MyClaw')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('MyClaw')
    fireEvent.change(nameInput, { target: { value: 'UpdatedClaw' } })
    fireEvent.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'UpdatedClaw' }),
      )
    })
  })

  it('should render autonomy section', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Autonomy')).toBeInTheDocument()
      expect(screen.getByText('Notifier')).toBeInTheDocument()
      expect(screen.getByText('Drafter')).toBeInTheDocument()
    })
  })

  it('should render keys section', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Keys')).toBeInTheDocument()
      expect(screen.getByText('Claw ID')).toBeInTheDocument()
    })
  })

  it('should render webhooks section', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Webhooks')).toBeInTheDocument()
      expect(screen.getByText('No webhooks configured')).toBeInTheDocument()
    })
  })

  it('should render danger zone', () => {
    renderPage()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByText('Clear Local Keys')).toBeInTheDocument()
  })
})
