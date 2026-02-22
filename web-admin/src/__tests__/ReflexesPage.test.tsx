import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ReflexesPage from '../pages/ReflexesPage.js'
import * as apiClient from '../lib/api-client.js'

vi.mock('../lib/api-client.js', () => ({
  adminApi: {
    getReflexStats: vi.fn(),
  },
}))

const mockStats = {
  total: 200,
  allowed: 160,
  blocked: 30,
  escalated: 10,
}

describe('ReflexesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.adminApi.getReflexStats).mockResolvedValue(mockStats)
  })

  it('renders page heading', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('Reflex Stats')).toBeDefined()
    })
  })

  it('shows total executions count', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('200')).toBeDefined()
      expect(screen.getByText('Total Executions')).toBeDefined()
    })
  })

  it('shows allowed count', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('160')).toBeDefined()
      expect(screen.getByText('Allowed')).toBeDefined()
    })
  })

  it('shows blocked count', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('30')).toBeDefined()
      expect(screen.getByText('Blocked')).toBeDefined()
    })
  })

  it('shows escalated count', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('10')).toBeDefined()
      expect(screen.getByText('Escalated')).toBeDefined()
    })
  })

  it('shows percentage for allowed', async () => {
    render(<ReflexesPage />)
    await waitFor(() => {
      // 160/200 = 80%
      expect(screen.getByText('80%')).toBeDefined()
    })
  })

  it('shows "Loading..." before data arrives', () => {
    vi.mocked(apiClient.adminApi.getReflexStats).mockReturnValue(new Promise(() => {}))
    render(<ReflexesPage />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('shows error message on API failure', async () => {
    vi.mocked(apiClient.adminApi.getReflexStats).mockRejectedValue(new Error('Stats unavailable'))
    render(<ReflexesPage />)
    await waitFor(() => {
      expect(screen.getByText('Stats unavailable')).toBeDefined()
    })
  })

  it('shows 0% when total is 0', async () => {
    vi.mocked(apiClient.adminApi.getReflexStats).mockResolvedValue({
      total: 0, allowed: 0, blocked: 0, escalated: 0,
    })
    render(<ReflexesPage />)
    await waitFor(() => {
      const pcts = screen.getAllByText('0%')
      expect(pcts.length).toBeGreaterThanOrEqual(1)
    })
  })
})
