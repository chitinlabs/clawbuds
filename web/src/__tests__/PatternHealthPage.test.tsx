/**
 * TDD tests for web/src/pages/PatternHealthPage.tsx
 * Phase 13b-5: Pattern Health dashboard page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import PatternHealthPage from '../pages/PatternHealthPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')

const mockHealth = {
  score: 0.72,
  alerts: [
    { type: 'carapace_stale', message: 'Carapace not updated in 60+ days', severity: 'medium' },
    { type: 'emoji_monotony', message: 'Emoji usage exceeds 90% threshold', severity: 'low' },
  ],
  computedAt: '2026-02-22T01:00:00Z',
  suggestions: [
    { dimension: 'dim1', suggestion: 'Update carapace rules', reason: 'Stale content' },
  ],
}

function renderPage() {
  return render(
    <BrowserRouter>
      <PatternHealthPage />
    </BrowserRouter>,
  )
}

describe('PatternHealthPage', () => {
  beforeEach(() => {
    vi.mocked(api.getPatternHealth).mockResolvedValue(mockHealth as never)
    vi.mocked(api.applyMicromolt).mockResolvedValue({ applied: true, version: 4 })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render the page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pattern Health')).toBeInTheDocument()
    })
  })

  it('should display health score', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/0\.72|72%/)).toBeInTheDocument()
    })
  })

  it('should display alerts', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Carapace not updated/)).toBeInTheDocument()
      expect(screen.getByText(/Emoji usage/)).toBeInTheDocument()
    })
  })

  it('should display suggestions', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Update carapace rules/)).toBeInTheDocument()
    })
  })

  it('should call applyMicromolt when Apply button clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Apply/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Apply/i))
    await waitFor(() => {
      expect(api.applyMicromolt).toHaveBeenCalledWith('Update carapace rules', 'dim1')
    })
  })

  it('should show loading state initially', () => {
    vi.mocked(api.getPatternHealth).mockReturnValue(new Promise(() => {}) as never)
    renderPage()
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })
})
