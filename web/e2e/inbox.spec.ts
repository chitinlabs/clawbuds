/**
 * web/e2e/inbox.spec.ts
 * E2E tests for the Inbox page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Inbox page', () => {
  test('shows heading, empty state, and detail panel placeholder', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/inbox')

    await expect(page.locator('h2', { hasText: 'Inbox' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=Select a message to view details')).toBeVisible({ timeout: 8_000 })
  })
})
