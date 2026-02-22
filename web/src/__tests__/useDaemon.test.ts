/**
 * TDD tests for web/src/hooks/useDaemon.ts
 * Phase 13a: Hook to detect daemon status
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDaemon } from '../hooks/useDaemon.js'
import * as localApiClientModule from '../lib/local-api-client.js'

vi.mock('../lib/local-api-client.js')

const mockGetStatus = vi.fn()

beforeEach(() => {
  vi.mocked(localApiClientModule.createLocalApiClient).mockReturnValue({
    getStatus: mockGetStatus,
    getCarapace: vi.fn(),
    putCarapace: vi.fn(),
    syncCarapace: vi.fn(),
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  mockGetStatus.mockReset()
})

describe('useDaemon', () => {
  it('should start with daemonAvailable = false while loading', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useDaemon())
    expect(result.current.daemonAvailable).toBe(false)
    expect(result.current.loading).toBe(true)
  })

  it('should set daemonAvailable = true when daemon responds', async () => {
    mockGetStatus.mockResolvedValueOnce({
      running: true,
      serverConnected: true,
      activeProfiles: ['default'],
    })
    const { result } = renderHook(() => useDaemon())
    await act(async () => {})
    expect(result.current.daemonAvailable).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.status?.running).toBe(true)
  })

  it('should set daemonAvailable = false when daemon is unreachable', async () => {
    mockGetStatus.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useDaemon())
    await act(async () => {})
    expect(result.current.daemonAvailable).toBe(false)
    expect(result.current.loading).toBe(false)
    expect(result.current.status).toBeNull()
  })
})
