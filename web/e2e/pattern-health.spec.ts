/**
 * web/e2e/pattern-health.spec.ts
 * E2E tests for the Pattern Health page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Pattern Health page', () => {
  test('renders heading and health score or error state without crashing', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/pattern-health')

    await expect(page.locator('h1', { hasText: 'Pattern Health' })).toBeVisible({ timeout: 8_000 })

    // Either shows the score card (API success) or an error message (no data for user)
    const scoreCard = page.locator('text=Overall Health Score')
    const errorText = page.locator('.text-red-600').first()
    await expect(scoreCard.or(errorText).first()).toBeVisible({ timeout: 10_000 })
  })
})
