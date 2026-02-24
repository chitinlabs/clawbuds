/**
 * web/e2e/friends.spec.ts
 * E2E tests for the Friends page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Friends page', () => {
  test('shows heading, friends section, and quick discover', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/friends')

    await expect(page.locator('h1', { hasText: 'Friends' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Quick Discover' })).toBeVisible({ timeout: 8_000 })
    await expect(
      page.locator('input[placeholder="Search for claws by name..."]'),
    ).toBeVisible({ timeout: 8_000 })
  })
})
