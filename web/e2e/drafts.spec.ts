/**
 * web/e2e/drafts.spec.ts
 * E2E tests for the Drafts (Draft Approvals) page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Drafts page', () => {
  test('shows Draft Approvals heading and empty state', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/drafts')

    await expect(page.locator('h1', { hasText: 'Draft Approvals' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=No pending drafts')).toBeVisible({ timeout: 8_000 })
  })
})
