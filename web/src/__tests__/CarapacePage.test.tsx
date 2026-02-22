/**
 * TDD tests for web/src/pages/CarapacePage.tsx
 * Phase 13b-4: Carapace editor page (uses local API)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import CarapacePage from '../pages/CarapacePage'
import * as api from '../lib/api-client'
import * as localApiClientModule from '../lib/local-api-client'

vi.mock('../lib/api-client')
vi.mock('../lib/local-api-client')

const mockLocalClient = {
  getStatus: vi.fn().mockResolvedValue({ running: true, serverConnected: true, activeProfiles: ['default'] }),
  getCarapace: vi.fn().mockResolvedValue('# Carapace\n\n> Test rule'),
  putCarapace: vi.fn().mockResolvedValue({ version: 2, createdAt: '2026-02-22T00:00:00Z' }),
  syncCarapace: vi.fn().mockResolvedValue(3),
}

function renderPage() {
  return render(
    <BrowserRouter>
      <CarapacePage />
    </BrowserRouter>,
  )
}

describe('CarapacePage', () => {
  beforeEach(() => {
    vi.mocked(localApiClientModule.createLocalApiClient).mockReturnValue(mockLocalClient as never)
    vi.mocked(api.getCarapaceHistory).mockResolvedValue([
      { version: 2, clawId: 'claw_me', reason: 'manual', createdAt: '2026-02-22T00:00:00Z' },
      { version: 1, clawId: 'claw_me', reason: 'init', createdAt: '2026-02-21T00:00:00Z' },
    ] as never)
    vi.mocked(api.getCarapaceContent).mockResolvedValue({ content: '# Carapace', version: 2 } as never)
    mockLocalClient.getCarapace.mockResolvedValue('# Carapace\n\n> Test rule')
    mockLocalClient.putCarapace.mockResolvedValue({ version: 2, createdAt: '2026-02-22T00:00:00Z' })
    mockLocalClient.syncCarapace.mockResolvedValue(3)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render the page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Carapace Editor')).toBeInTheDocument()
    })
  })

  it('should load and display carapace content when daemon available', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/# Carapace/)).toBeInTheDocument()
    })
  })

  it('should show version history', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Version 2/)).toBeInTheDocument()
      expect(screen.getByText(/manual/)).toBeInTheDocument()
    })
  })

  it('should show sync button when daemon available', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Sync from Server/i)).toBeInTheDocument()
    })
  })

  it('should call syncCarapace when Sync button clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Sync from Server/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Sync from Server/i))
    await waitFor(() => {
      expect(mockLocalClient.syncCarapace).toHaveBeenCalled()
    })
  })

  it('should show fallback message when daemon not available', async () => {
    mockLocalClient.getCarapace.mockResolvedValueOnce(null)
    vi.mocked(localApiClientModule.createLocalApiClient).mockReturnValue({
      ...mockLocalClient,
      getStatus: vi.fn().mockResolvedValue(null),
      getCarapace: vi.fn().mockResolvedValue(null),
    } as never)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/daemon not available/i)).toBeInTheDocument()
    })
  })
})
