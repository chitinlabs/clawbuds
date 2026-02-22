import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClawsPage from '../pages/ClawsPage.js'
import * as apiClient from '../lib/api-client.js'

vi.mock('../lib/api-client.js', () => ({
  adminApi: {
    getClaws: vi.fn(),
    updateClawStatus: vi.fn(),
  },
}))

const mockClaw = {
  clawId: 'claw_alice',
  displayName: 'Alice',
  status: 'active' as const,
  createdAt: '2026-02-01T00:00:00Z',
}

describe('ClawsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [], total: 0 })
  })

  it('renders page heading', async () => {
    render(<ClawsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Claws/)).toBeDefined()
    })
  })

  it('renders search input', () => {
    render(<ClawsPage />)
    expect(screen.getByPlaceholderText('Search by name or ID...')).toBeDefined()
  })

  it('shows "No claws found" when list is empty', async () => {
    render(<ClawsPage />)
    await waitFor(() => {
      expect(screen.getByText('No claws found')).toBeDefined()
    })
  })

  it('shows "Loading..." while fetching', () => {
    vi.mocked(apiClient.adminApi.getClaws).mockReturnValue(new Promise(() => {}))
    render(<ClawsPage />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders claw rows when data is returned', async () => {
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [mockClaw], total: 1 })
    render(<ClawsPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.getByText('claw_alice')).toBeDefined()
      expect(screen.getByText('active')).toBeDefined()
    })
  })

  it('shows "Suspend" button for active claw', async () => {
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [mockClaw], total: 1 })
    render(<ClawsPage />)

    await waitFor(() => {
      expect(screen.getByText('Suspend')).toBeDefined()
    })
  })

  it('shows "Activate" button for suspended claw', async () => {
    const suspended = { ...mockClaw, status: 'suspended' as const }
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [suspended], total: 1 })
    render(<ClawsPage />)

    await waitFor(() => {
      expect(screen.getByText('Activate')).toBeDefined()
    })
  })

  it('calls updateClawStatus and reloads on Suspend click', async () => {
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [mockClaw], total: 1 })
    vi.mocked(apiClient.adminApi.updateClawStatus).mockResolvedValue(undefined)

    render(<ClawsPage />)
    await waitFor(() => screen.getByText('Suspend'))

    fireEvent.click(screen.getByText('Suspend'))
    await waitFor(() => {
      expect(vi.mocked(apiClient.adminApi.updateClawStatus)).toHaveBeenCalledWith('claw_alice', 'suspended')
      expect(vi.mocked(apiClient.adminApi.getClaws)).toHaveBeenCalledTimes(2)
    })
  })

  it('shows error message on API failure', async () => {
    vi.mocked(apiClient.adminApi.getClaws).mockRejectedValue(new Error('Network error'))
    render(<ClawsPage />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined()
    })
  })

  it('table has correct column headers', async () => {
    render(<ClawsPage />)
    await waitFor(() => {
      expect(screen.getByText('Display Name')).toBeDefined()
      expect(screen.getByText('Claw ID')).toBeDefined()
      expect(screen.getByText('Status')).toBeDefined()
      expect(screen.getByText('Joined')).toBeDefined()
      expect(screen.getByText('Actions')).toBeDefined()
    })
  })

  it('formats joined date as YYYY-MM-DD', async () => {
    vi.mocked(apiClient.adminApi.getClaws).mockResolvedValue({ claws: [mockClaw], total: 1 })
    render(<ClawsPage />)

    await waitFor(() => {
      expect(screen.getByText('2026-02-01')).toBeDefined()
    })
  })
})
