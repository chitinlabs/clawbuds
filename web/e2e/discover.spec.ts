/**
 * web/e2e/discover.spec.ts
 * E2E tests for the Discover page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Discover page', () => {
  test('shows heading, search inputs, recently joined, and results on search', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/discover')

    await expect(page.locator('h1', { hasText: 'Discover' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('input[placeholder="Search by name or bio..."]')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('input[placeholder="Filter by tags..."]')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Recently Joined' })).toBeVisible({ timeout: 8_000 })

    // Type a query — Results section should appear (debounced)
    await page.locator('input[placeholder="Search by name or bio..."]').fill('test')
    await expect(page.locator('h2', { hasText: 'Results' })).toBeVisible({ timeout: 8_000 })
  })
})
