import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import FriendsPage from '../pages/FriendsPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')
vi.mock('../stores/realtime.store', () => ({
  useRealtimeStore: vi.fn((sel) =>
    sel({ friendEvents: [], newInboxEntries: [], isConnected: false, lastEvent: null }),
  ),
}))

const mockFriends = [
  {
    clawId: 'claw_alice',
    displayName: 'Alice',
    bio: 'Hello world',
    friendshipId: 'f1',
    friendsSince: '2025-01-01T00:00:00Z',
  },
  {
    clawId: 'claw_bob',
    displayName: 'Bob',
    bio: '',
    friendshipId: 'f2',
    friendsSince: '2025-02-01T00:00:00Z',
  },
]

const mockPending = [
  {
    id: 'p1',
    requesterId: 'claw_charlie',
    accepterId: 'claw_me',
    status: 'pending' as const,
    createdAt: '2025-03-01T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <FriendsPage />
    </BrowserRouter>,
  )
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.mocked(api.listFriends).mockResolvedValue(mockFriends as never)
    vi.mocked(api.getPendingRequests).mockResolvedValue(mockPending as never)
    vi.mocked(api.acceptFriendRequest).mockResolvedValue({} as never)
    vi.mocked(api.rejectFriendRequest).mockResolvedValue({} as never)
    vi.mocked(api.removeFriend).mockResolvedValue({ removed: true })
    vi.mocked(api.sendFriendRequest).mockResolvedValue({} as never)
    vi.mocked(api.discover).mockResolvedValue({ results: [], total: 0 })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render friends list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('should show pending requests', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pending Requests (1)')).toBeInTheDocument()
      expect(screen.getByText('claw_charlie')).toBeInTheDocument()
    })
  })

  it('should accept a friend request', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('claw_charlie')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Accept'))
    await waitFor(() => {
      expect(api.acceptFriendRequest).toHaveBeenCalledWith('p1')
    })
  })

  it('should reject a friend request', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('claw_charlie')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reject'))
    await waitFor(() => {
      expect(api.rejectFriendRequest).toHaveBeenCalledWith('p1')
    })
  })

  it('should remove a friend', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByText('Remove')
    fireEvent.click(removeButtons[0])
    await waitFor(() => {
      expect(api.removeFriend).toHaveBeenCalledWith('claw_alice')
    })
  })

  it('should search for claws in quick discover', async () => {
    vi.mocked(api.discover).mockResolvedValue({
      results: [
        {
          clawId: 'claw_dave',
          displayName: 'Dave',
          bio: 'Hi',
          clawType: 'personal',
          tags: [],
          isOnline: true,
        },
      ],
      total: 1,
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Quick Discover')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Search for claws by name...')
    fireEvent.change(input, { target: { value: 'Dave' } })

    await waitFor(() => {
      expect(api.discover).toHaveBeenCalled()
    })
  })

  it('should show empty state when no friends', async () => {
    vi.mocked(api.listFriends).mockResolvedValue([])
    vi.mocked(api.getPendingRequests).mockResolvedValue([])

    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No friends yet/)).toBeInTheDocument()
    })
  })
})
