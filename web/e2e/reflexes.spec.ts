/**
 * web/e2e/reflexes.spec.ts
 * E2E tests for the Reflexes page.
 *
 * Note: new users have system-default reflexes (e.g. keepalive_heartbeat),
 * so there is no "empty state" for a fresh account.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Reflexes page', () => {
  test('renders heading, sections, and reflex list without crashing', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/reflexes')

    await expect(page.locator('h1', { hasText: 'Reflexes' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Rules' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Recent Executions' })).toBeVisible({ timeout: 8_000 })
    // System-default reflexes are present; at least one Disable button should appear
    await expect(page.locator('button', { hasText: 'Disable' }).first()).toBeVisible({ timeout: 8_000 })
  })
})
