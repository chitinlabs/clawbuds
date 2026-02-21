import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import LoginPage from '../pages/LoginPage.js'
import * as apiClient from '../lib/api-client.js'

vi.mock('../lib/api-client.js', () => ({
  adminApi: {
    checkAuth: vi.fn(),
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('renders login form', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByPlaceholderText('Enter admin key')).toBeDefined()
    expect(screen.getByText('Login')).toBeDefined()
  })

  it('shows error on invalid key', async () => {
    vi.mocked(apiClient.adminApi.checkAuth).mockResolvedValue(401)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    const input = screen.getByPlaceholderText('Enter admin key')
    fireEvent.change(input, { target: { value: 'wrong-key' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Invalid admin key.')).toBeDefined()
    })
  })

  it('shows error when admin not configured (503)', async () => {
    vi.mocked(apiClient.adminApi.checkAuth).mockResolvedValue(503)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    const input = screen.getByPlaceholderText('Enter admin key')
    fireEvent.change(input, { target: { value: 'any-key' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Admin access not configured on this server.')).toBeDefined()
    })
  })
})
