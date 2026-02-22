import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import WebhooksPage from '../pages/WebhooksPage.js'
import * as apiClient from '../lib/api-client.js'

vi.mock('../lib/api-client.js', () => ({
  adminApi: {
    getWebhookDeliveries: vi.fn(),
  },
}))

const mockDelivery = {
  id: 'del_001',
  event: 'message.created',
  status: 'delivered' as const,
  responseStatus: 200,
  createdAt: '2026-02-22T10:30:00Z',
}

const mockFailedDelivery = {
  id: 'del_002',
  event: 'pearl.shared',
  status: 'failed' as const,
  responseStatus: 500,
  createdAt: '2026-02-22T11:00:00Z',
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockResolvedValue({ deliveries: [] })
  })

  it('renders page heading', async () => {
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('Webhook Deliveries')).toBeDefined()
    })
  })

  it('shows "No deliveries found" when list is empty', async () => {
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('No deliveries found')).toBeDefined()
    })
  })

  it('shows "Loading..." while fetching', () => {
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockReturnValue(new Promise(() => {}))
    render(<WebhooksPage />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders table column headers', async () => {
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('Event')).toBeDefined()
      expect(screen.getByText('Status')).toBeDefined()
      expect(screen.getByText('HTTP')).toBeDefined()
      expect(screen.getByText('Time')).toBeDefined()
    })
  })

  it('renders delivered delivery row', async () => {
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockResolvedValue({ deliveries: [mockDelivery] })
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('message.created')).toBeDefined()
      expect(screen.getByText('delivered')).toBeDefined()
      expect(screen.getByText('200')).toBeDefined()
    })
  })

  it('renders failed delivery row with red badge', async () => {
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockResolvedValue({ deliveries: [mockFailedDelivery] })
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('pearl.shared')).toBeDefined()
      expect(screen.getByText('failed')).toBeDefined()
      expect(screen.getByText('500')).toBeDefined()
    })
  })

  it('shows "—" when responseStatus is null', async () => {
    const noStatus = { ...mockDelivery, responseStatus: null }
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockResolvedValue({ deliveries: [noStatus] })
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('—')).toBeDefined()
    })
  })

  it('formats createdAt as "YYYY-MM-DD HH:MM"', async () => {
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockResolvedValue({ deliveries: [mockDelivery] })
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('2026-02-22 10:30')).toBeDefined()
    })
  })

  it('shows error message on API failure', async () => {
    vi.mocked(apiClient.adminApi.getWebhookDeliveries).mockRejectedValue(new Error('Connection refused'))
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeDefined()
    })
  })

  it('calls getWebhookDeliveries with limit 100 on mount', async () => {
    render(<WebhooksPage />)
    await waitFor(() => {
      expect(vi.mocked(apiClient.adminApi.getWebhookDeliveries)).toHaveBeenCalledWith(100)
    })
  })
})
