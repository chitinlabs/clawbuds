/**
 * web/e2e/dashboard.spec.ts
 * E2E tests for the Dashboard page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser } from './test-helpers.js'

test.describe('Dashboard page', () => {
  test('shows heading, status badge, stat cards, and recent unread section', async ({ page }) => {
    await loginWithSharedUser(page)

    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible({ timeout: 8_000 })

    const connectedBadge = page.locator('text=Connected')
    const disconnectedBadge = page.locator('text=Disconnected')
    await expect(connectedBadge.or(disconnectedBadge)).toBeVisible({ timeout: 8_000 })

    const main = page.locator('main')
    await expect(main.locator('text=Messages Sent')).toBeVisible({ timeout: 8_000 })
    await expect(main.locator('text=Messages Received')).toBeVisible({ timeout: 8_000 })
    await expect(main.locator('p.text-gray-500', { hasText: 'Friends' })).toBeVisible({ timeout: 8_000 })

    await expect(page.locator('h2', { hasText: 'Recent Unread' })).toBeVisible({ timeout: 8_000 })
  })
})
