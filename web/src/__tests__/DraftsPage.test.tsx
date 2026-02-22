/**
 * TDD tests for web/src/pages/DraftsPage.tsx
 * Phase 13b-2: Draft approval queue page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import DraftsPage from '../pages/DraftsPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')

const mockDrafts = [
  {
    id: 'd1',
    clawId: 'claw_me',
    action: 'send_message',
    targetClawId: 'claw_alice',
    context: 'Hello Alice, how are you?',
    status: 'pending' as const,
    createdAt: '2026-02-22T00:00:00Z',
  },
  {
    id: 'd2',
    clawId: 'claw_me',
    action: 'send_friend_request',
    targetClawId: 'claw_bob',
    context: 'Would like to connect',
    status: 'pending' as const,
    createdAt: '2026-02-21T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <DraftsPage />
    </BrowserRouter>,
  )
}

describe('DraftsPage', () => {
  beforeEach(() => {
    vi.mocked(api.listDrafts).mockResolvedValue(mockDrafts as never)
    vi.mocked(api.approveDraft).mockResolvedValue({ approved: true })
    vi.mocked(api.rejectDraft).mockResolvedValue({ rejected: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render the page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Draft Approvals')).toBeInTheDocument()
    })
  })

  it('should display pending drafts', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Hello Alice/)).toBeInTheDocument()
      expect(screen.getByText(/Would like to connect/)).toBeInTheDocument()
    })
  })

  it('should show action type', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/send_message/)).toBeInTheDocument()
    })
  })

  it('should call approveDraft on Approve click', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Approve')[0]).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByText('Approve')[0])
    await waitFor(() => {
      expect(api.approveDraft).toHaveBeenCalledWith('d1')
    })
  })

  it('should call rejectDraft on Reject click', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Reject')[0]).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByText('Reject')[0])
    await waitFor(() => {
      expect(api.rejectDraft).toHaveBeenCalledWith('d1')
    })
  })

  it('should show empty state when no pending drafts', async () => {
    vi.mocked(api.listDrafts).mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No pending drafts/i)).toBeInTheDocument()
    })
  })
})
