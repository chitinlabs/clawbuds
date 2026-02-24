import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import InboxPage from '../pages/InboxPage'
import * as api from '../lib/api-client'
import type { InboxEntry } from '../types/api'

vi.mock('../lib/api-client')
vi.mock('../pages/ConversationDetail', () => ({
  default: ({ entry, onAck }: { entry: InboxEntry; onAck: (id: string) => void }) => (
    <div data-testid="conversation-detail">
      <span>Detail #{entry.seq}</span>
      <button onClick={() => onAck(entry.id)}>MockAck</button>
    </div>
  ),
}))

const mockEntries: InboxEntry[] = [
  {
    id: 'e1',
    recipientId: 'claw_r1',
    messageId: 'msg_1',
    seq: 101,
    status: 'unread',
    createdAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'e2',
    recipientId: 'claw_r2',
    messageId: 'msg_2',
    seq: 102,
    status: 'read',
    createdAt: '2025-06-02T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <InboxPage />
    </BrowserRouter>,
  )
}

describe('InboxPage', () => {
  beforeEach(() => {
    vi.mocked(api.getInbox).mockResolvedValue(mockEntries)
    vi.mocked(api.ackInbox).mockResolvedValue({ acknowledged: 1 })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should show loading state initially', () => {
    // Never resolve so we stay in loading
    vi.mocked(api.getInbox).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading inbox...')).toBeInTheDocument()
  })

  it('should call getInbox with correct params on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(api.getInbox).toHaveBeenCalledWith({ status: 'all', limit: 50 })
    })
  })

  it('should render message entries after loading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
      expect(screen.getByText('#102')).toBeInTheDocument()
    })
  })

  it('should display entry status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('unread')).toBeInTheDocument()
      expect(screen.getByText('read')).toBeInTheDocument()
    })
  })

  it('should show empty state when no messages', async () => {
    vi.mocked(api.getInbox).mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No messages')).toBeInTheDocument()
    })
  })

  it('should show placeholder when no message is selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Select a message to view details')).toBeInTheDocument()
    })
  })

  it('should show ConversationDetail when an entry is clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('#101'))
    await waitFor(() => {
      expect(screen.getByTestId('conversation-detail')).toBeInTheDocument()
      expect(screen.getByText('Detail #101')).toBeInTheDocument()
    })
  })

  it('should call ackInbox and update local status via handleAck', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('#101')).toBeInTheDocument()
    })

    // Select the first entry to show the detail
    fireEvent.click(screen.getByText('#101'))
    await waitFor(() => {
      expect(screen.getByTestId('conversation-detail')).toBeInTheDocument()
    })

    // Click the mock ack button inside ConversationDetail
    fireEvent.click(screen.getByText('MockAck'))
    await waitFor(() => {
      expect(api.ackInbox).toHaveBeenCalledWith(['e1'])
    })
  })

  it('should display error message when getInbox fails', async () => {
    vi.mocked(api.getInbox).mockRejectedValue(new Error('Network failure'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument()
    })
  })

  it('should display fallback error message for non-Error throws', async () => {
    vi.mocked(api.getInbox).mockRejectedValue('something went wrong')
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Failed to load inbox')).toBeInTheDocument()
    })
  })
})
