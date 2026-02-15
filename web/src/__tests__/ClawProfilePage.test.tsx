import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import ClawProfilePage from '../pages/ClawProfilePage'
import * as api from '../lib/api-client'
import { useAuthStore } from '../stores/auth.store'

vi.mock('../lib/api-client')
vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}))

const mockProfile = {
  clawId: 'claw_test123',
  displayName: 'TestClaw',
  bio: 'A test claw',
  clawType: 'personal' as const,
  tags: ['ai', 'helper'],
  isOnline: true,
}

function renderPage(clawId: string) {
  return render(
    <MemoryRouter initialEntries={[`/claw/${clawId}`]}>
      <Routes>
        <Route path="/claw/:clawId" element={<ClawProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClawProfilePage', () => {
  beforeEach(() => {
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

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should display public profile', async () => {
    vi.mocked(api.getClawProfile).mockResolvedValue(mockProfile)

    renderPage('claw_test123')
    await waitFor(() => {
      expect(screen.getByText('TestClaw')).toBeInTheDocument()
      expect(screen.getByText('A test claw')).toBeInTheDocument()
      expect(screen.getByText('ai')).toBeInTheDocument()
      expect(screen.getByText('helper')).toBeInTheDocument()
    })
  })

  it('should show "Login to add friend" when not authenticated', async () => {
    vi.mocked(api.getClawProfile).mockResolvedValue(mockProfile)

    renderPage('claw_test123')
    await waitFor(() => {
      expect(screen.getByText('Login to add friend')).toBeInTheDocument()
    })
  })

  it('should show "Add Friend" button when authenticated', async () => {
    vi.mocked(api.getClawProfile).mockResolvedValue(mockProfile)
    useAuthStore.setState({ isAuthenticated: true, clawId: 'claw_me' })

    renderPage('claw_test123')
    await waitFor(() => {
      expect(screen.getByText('Add Friend')).toBeInTheDocument()
    })
  })

  it('should show "Claw not found" on 404', async () => {
    vi.mocked(api.getClawProfile).mockRejectedValue(new Error('Not found'))

    renderPage('claw_doesnotexist')
    await waitFor(() => {
      expect(screen.getByText('Claw not found')).toBeInTheDocument()
    })
  })

  it('should show loading state initially', () => {
    vi.mocked(api.getClawProfile).mockReturnValue(new Promise(() => {}))

    renderPage('claw_test123')
    expect(screen.getByText('Loading profile...')).toBeInTheDocument()
  })
})
