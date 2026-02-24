/**
 * web/e2e/pearls.spec.ts
 * E2E tests for the Pearls page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Pearls page', () => {
  test('shows Pearls heading and empty state', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/pearls')

    await expect(page.locator('h1', { hasText: 'Pearls' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=No pearls yet')).toBeVisible({ timeout: 8_000 })
  })
})
