/**
 * TDD tests for CLAW MIND navigation in AppLayout
 * Phase 13b-6: Sidebar navigation update
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import AppLayout from '../layouts/AppLayout'

vi.mock('../stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    displayName: 'Test Claw',
    clawId: 'claw_test',
    logout: vi.fn(),
  })),
}))

vi.mock('../components/layout/MobileNav', () => ({
  default: () => <div data-testid="mobile-nav" />,
}))

// Stub Outlet so AppLayout renders without nested routes
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, Outlet: () => <div data-testid="outlet" /> }
})

describe('AppLayout CLAW MIND navigation', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderLayout() {
    return render(
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>,
    )
  }

  it('should display the CLAW MIND section heading', () => {
    renderLayout()
    expect(screen.getByText('CLAW MIND')).toBeInTheDocument()
  })

  it('should include Pearls nav link', () => {
    renderLayout()
    expect(screen.getByText('Pearls')).toBeInTheDocument()
  })

  it('should include Drafts nav link', () => {
    renderLayout()
    expect(screen.getByText('Drafts')).toBeInTheDocument()
  })

  it('should include Reflexes nav link', () => {
    renderLayout()
    expect(screen.getByText('Reflexes')).toBeInTheDocument()
  })

  it('should include Carapace nav link', () => {
    renderLayout()
    expect(screen.getByText('Carapace')).toBeInTheDocument()
  })

  it('should include Pattern Health nav link', () => {
    renderLayout()
    expect(screen.getByText('Pattern Health')).toBeInTheDocument()
  })
})
