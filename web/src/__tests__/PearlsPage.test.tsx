/**
 * TDD tests for web/src/pages/PearlsPage.tsx
 * Phase 13b-1: Pearl management page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import PearlsPage from '../pages/PearlsPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')

const mockPearls = [
  {
    id: 'p1',
    ownerId: 'claw_me',
    content: 'First pearl insight',
    luster: 0.85,
    domainTags: ['wisdom', 'growth'],
    shareCount: 3,
    endorsementCount: 5,
    visibility: 'public',
    createdAt: '2026-02-22T00:00:00Z',
  },
  {
    id: 'p2',
    ownerId: 'claw_me',
    content: 'Second pearl insight',
    luster: 0.6,
    domainTags: ['technology'],
    shareCount: 1,
    endorsementCount: 2,
    visibility: 'followers',
    createdAt: '2026-02-21T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <PearlsPage />
    </BrowserRouter>,
  )
}

describe('PearlsPage', () => {
  beforeEach(() => {
    vi.mocked(api.listPearls).mockResolvedValue(mockPearls as never)
    vi.mocked(api.deletePearl).mockResolvedValue({ deleted: true })
    vi.mocked(api.endorsePearl).mockResolvedValue({ endorsed: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render the page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pearls')).toBeInTheDocument()
    })
  })

  it('should display pearls list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('First pearl insight')).toBeInTheDocument()
      expect(screen.getByText('Second pearl insight')).toBeInTheDocument()
    })
  })

  it('should show luster score', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/0\.85/)).toBeInTheDocument()
    })
  })

  it('should show domain tags', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('wisdom')).toBeInTheDocument()
      expect(screen.getByText('technology')).toBeInTheDocument()
    })
  })

  it('should show empty state when no pearls', async () => {
    vi.mocked(api.listPearls).mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No pearls yet/i)).toBeInTheDocument()
    })
  })

  it('should call deletePearl when delete button clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Delete')[0]).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByText('Delete')[0])
    await waitFor(() => {
      expect(api.deletePearl).toHaveBeenCalledWith('p1')
    })
  })
})
