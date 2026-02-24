import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import ConversationDetail from '../pages/ConversationDetail'
import * as api from '../lib/api-client'
import type { InboxEntry } from '../types/api'

vi.mock('../lib/api-client')

const mockEntry: InboxEntry = {
  id: 'e1',
  recipientId: 'claw_r1',
  messageId: 'msg_abc123',
  seq: 42,
  status: 'unread',
  createdAt: '2025-06-01T12:00:00Z',
}

const mockAckedEntry: InboxEntry = {
  ...mockEntry,
  id: 'e2',
  status: 'acked',
}

function renderDetail(entry: InboxEntry = mockEntry, onAck = vi.fn()) {
  return {
    onAck,
    ...render(
      <BrowserRouter>
        <ConversationDetail entry={entry} onAck={onAck} />
      </BrowserRouter>,
    ),
  }
}

describe('ConversationDetail', () => {
  beforeEach(() => {
    vi.mocked(api.sendMessage).mockResolvedValue({ messageId: 'msg_new' })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should display the message heading with seq number', () => {
    renderDetail()
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Message #42')
  })

  it('should display entry messageId', () => {
    renderDetail()
    expect(screen.getByText('msg_abc123')).toBeInTheDocument()
  })

  it('should display entry status', () => {
    renderDetail()
    expect(screen.getByText('unread')).toBeInTheDocument()
  })

  it('should display entry seq in key-value section', () => {
    renderDetail()
    // The seq appears in heading and in the detail section
    const seqElements = screen.getAllByText('42')
    expect(seqElements.length).toBeGreaterThanOrEqual(1)
  })

  it('should show Acknowledge button when status is not acked', () => {
    renderDetail()
    expect(screen.getByText('Acknowledge')).toBeInTheDocument()
  })

  it('should call onAck with entry id when Acknowledge is clicked', () => {
    const onAck = vi.fn()
    renderDetail(mockEntry, onAck)

    fireEvent.click(screen.getByText('Acknowledge'))
    expect(onAck).toHaveBeenCalledWith('e1')
  })

  it('should not show Acknowledge button when status is acked', () => {
    renderDetail(mockAckedEntry)
    expect(screen.queryByText('Acknowledge')).not.toBeInTheDocument()
  })

  it('should have Send button disabled when input is empty', () => {
    renderDetail()
    const sendButton = screen.getByText('Send')
    expect(sendButton).toBeDisabled()
  })

  it('should enable Send button when text is entered', () => {
    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: 'Hello there' } })

    const sendButton = screen.getByText('Send')
    expect(sendButton).not.toBeDisabled()
  })

  it('should call sendMessage with correct params on form submit', async () => {
    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: 'Hello there' } })

    const sendButton = screen.getByText('Send')
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith({
        blocks: [{ type: 'text', text: 'Hello there' }],
        visibility: 'direct',
        toClawIds: ['claw_r1'],
      })
    })
  })

  it('should clear input after successful send', async () => {
    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('should trim whitespace before sending', async () => {
    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: '  trimmed message  ' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith({
        blocks: [{ type: 'text', text: 'trimmed message' }],
        visibility: 'direct',
        toClawIds: ['claw_r1'],
      })
    })
  })

  it('should not call sendMessage when input is only whitespace', () => {
    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: '   ' } })

    // Send button should be disabled for whitespace-only input
    const sendButton = screen.getByText('Send')
    expect(sendButton).toBeDisabled()
  })

  it('should show Sending... text while message is being sent', async () => {
    // Make sendMessage hang so we can observe the sending state
    let resolveSend: (value: { messageId: string }) => void
    vi.mocked(api.sendMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )

    renderDetail()
    const input = screen.getByPlaceholderText('Type a reply...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument()
    })

    // Resolve and verify we return to normal state
    resolveSend!({ messageId: 'msg_new' })
    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument()
    })
  })
})
