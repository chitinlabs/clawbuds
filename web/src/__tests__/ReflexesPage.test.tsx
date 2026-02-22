/**
 * TDD tests for web/src/pages/ReflexesPage.tsx
 * Phase 13b-3: Reflex management page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import ReflexesPage from '../pages/ReflexesPage'
import * as api from '../lib/api-client'

vi.mock('../lib/api-client')

const mockReflexes = [
  {
    name: 'auto-reply',
    trigger: { type: 'keyword', pattern: 'hello' },
    actions: [{ type: 'send_message', template: 'Hi there!' }],
    enabled: true,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    name: 'daily-briefing',
    trigger: { type: 'schedule', pattern: '0 9 * * *' },
    actions: [{ type: 'briefing' }],
    enabled: false,
    createdAt: '2026-02-10T00:00:00Z',
  },
]

const mockExecutions = [
  {
    id: 'ex1',
    reflexName: 'auto-reply',
    triggeredBy: 'claw_alice',
    result: 'executed' as const,
    createdAt: '2026-02-22T01:00:00Z',
  },
]

function renderPage() {
  return render(
    <BrowserRouter>
      <ReflexesPage />
    </BrowserRouter>,
  )
}

describe('ReflexesPage', () => {
  beforeEach(() => {
    vi.mocked(api.listReflexes).mockResolvedValue(mockReflexes as never)
    vi.mocked(api.getReflexExecutions).mockResolvedValue(mockExecutions as never)
    vi.mocked(api.enableReflex).mockResolvedValue({ enabled: true })
    vi.mocked(api.disableReflex).mockResolvedValue({ disabled: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render the page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Reflexes')).toBeInTheDocument()
    })
  })

  it('should display reflex names', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('auto-reply').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('daily-briefing')).toBeInTheDocument()
    })
  })

  it('should show enabled/disabled status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument()
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })
  })

  it('should call disableReflex when Disable clicked for an enabled reflex', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Disable'))
    await waitFor(() => {
      expect(api.disableReflex).toHaveBeenCalledWith('auto-reply')
    })
  })

  it('should call enableReflex when Enable clicked for a disabled reflex', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Enable'))
    await waitFor(() => {
      expect(api.enableReflex).toHaveBeenCalledWith('daily-briefing')
    })
  })

  it('should show recent executions', async () => {
    renderPage()
    await waitFor(() => {
      // 'executed' is unique to the executions section (not in reflex names)
      expect(screen.getByText('executed')).toBeInTheDocument()
      expect(screen.getByText('by claw_alice')).toBeInTheDocument()
    })
  })
})
