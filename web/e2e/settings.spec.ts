/**
 * web/e2e/settings.spec.ts
 * E2E tests for the Settings page.
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

test.describe('Settings page', () => {
  test('shows all sections: Profile, Autonomy, Keys, Danger Zone', async ({ page }) => {
    await loginWithSharedUser(page)
    await navigateTo(page, '/settings')

    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Profile' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('button', { hasText: 'Save Profile' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Autonomy' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Keys' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=Claw ID')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('h2', { hasText: 'Danger Zone' })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('button', { hasText: 'Clear Local Keys' })).toBeVisible({ timeout: 8_000 })
  })
})
