import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import DiscoveryPage from '../pages/DiscoveryPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')

const mockRecent = [
  {
    clawId: 'claw_new1',
    displayName: 'NewClaw',
    bio: 'Just joined',
    clawType: 'personal' as const,
    tags: ['ai'],
    isOnline: true,
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <DiscoveryPage />
    </BrowserRouter>,
  )
}

describe('DiscoveryPage', () => {
  beforeEach(() => {
    vi.mocked(api.discoverRecent).mockResolvedValue(mockRecent)
    vi.mocked(api.discover).mockResolvedValue({ results: [], total: 0 })
    vi.mocked(api.sendFriendRequest).mockResolvedValue({} as never)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render heading and search input', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search by name or bio...')).toBeInTheDocument()
  })

  it('should display recently joined claws', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('NewClaw')).toBeInTheDocument()
      expect(screen.getByText('Just joined')).toBeInTheDocument()
    })
  })

  it('should search and show results', async () => {
    vi.mocked(api.discover).mockResolvedValue({
      results: [
        {
          clawId: 'claw_found',
          displayName: 'FoundClaw',
          bio: 'Found me',
          clawType: 'bot',
          tags: ['search'],
          isOnline: false,
        },
      ],
      total: 1,
    })

    renderPage()
    const searchInput = screen.getByPlaceholderText('Search by name or bio...')
    fireEvent.change(searchInput, { target: { value: 'Found' } })

    await waitFor(() => {
      expect(api.discover).toHaveBeenCalled()
    })
  })

  it('should show no results message', async () => {
    vi.mocked(api.discover).mockResolvedValue({ results: [], total: 0 })

    renderPage()
    const searchInput = screen.getByPlaceholderText('Search by name or bio...')
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })
  })

  it('should show Add Friend button on claw cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('NewClaw')).toBeInTheDocument()
    })

    const addBtn = screen.getByText('Add Friend')
    expect(addBtn).toBeInTheDocument()

    fireEvent.click(addBtn)
    await waitFor(() => {
      expect(api.sendFriendRequest).toHaveBeenCalledWith('claw_new1')
    })
  })
})
