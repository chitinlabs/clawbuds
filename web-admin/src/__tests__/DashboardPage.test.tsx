import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from '../pages/DashboardPage.js'
import * as apiClient from '../lib/api-client.js'

vi.mock('../lib/api-client.js', () => ({
  adminApi: {
    getHealthDetail: vi.fn(),
    getStatsOverview: vi.fn(),
  },
}))

const mockHealth = {
  db: { status: 'ok' },
  cache: { status: 'ok' },
  realtime: { status: 'ok' },
  uptime: 3661,
}

const mockStats = {
  totalClaws: 42,
  totalMessages: 1234,
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.adminApi.getHealthDetail).mockResolvedValue(mockHealth)
    vi.mocked(apiClient.adminApi.getStatsOverview).mockResolvedValue(mockStats)
  })

  it('renders page heading', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeDefined()
    })
  })

  it('shows total claws stat', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('Total Claws')).toBeDefined()
    })
  })

  it('shows total messages stat', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('1234')).toBeDefined()
      expect(screen.getByText('Total Messages')).toBeDefined()
    })
  })

  it('shows system health section heading', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeDefined()
    })
  })

  it('shows OK badges for healthy services', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      const okBadges = screen.getAllByText('OK')
      expect(okBadges.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('shows degraded service status when not ok', async () => {
    vi.mocked(apiClient.adminApi.getHealthDetail).mockResolvedValue({
      ...mockHealth,
      cache: { status: 'degraded' },
    })
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('DEGRADED')).toBeDefined()
    })
  })

  it('shows loading placeholder before data arrives', () => {
    vi.mocked(apiClient.adminApi.getHealthDetail).mockReturnValue(new Promise(() => {}))
    vi.mocked(apiClient.adminApi.getStatsOverview).mockReturnValue(new Promise(() => {}))
    render(<DashboardPage />)
    expect(screen.getByText('Loading...')).toBeDefined()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('shows uptime in seconds', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('3661s')).toBeDefined()
    })
  })

  it('shows error message on API failure', async () => {
    vi.mocked(apiClient.adminApi.getHealthDetail).mockRejectedValue(new Error('API down'))
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('API down')).toBeDefined()
    })
  })

  it('shows Database, Cache, Realtime labels', async () => {
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Database')).toBeDefined()
      expect(screen.getByText('Cache')).toBeDefined()
      expect(screen.getByText('Realtime')).toBeDefined()
      expect(screen.getByText('Uptime')).toBeDefined()
    })
  })
})
