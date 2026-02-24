/**
 * web/e2e/auth.spec.ts
 * E2E tests for authentication flow: login page, registration, and redirect.
 */
import { test, expect } from '@playwright/test'

test.describe('Auth — Login & Registration', () => {
  test('login page shows Create New Identity and Import Key Backup buttons', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Create New Identity', { timeout: 10_000 })

    await expect(page.locator('text=Create New Identity')).toBeVisible()
    await expect(page.locator('text=Import Key Backup')).toBeVisible()
  })

  test('Create New Identity navigates to /register with form elements', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Create New Identity', { timeout: 10_000 })
    await page.click('text=Create New Identity')
    await page.waitForURL('**/register', { timeout: 5_000 })

    await expect(page).toHaveURL(/\/register/)
    await expect(page.locator('#displayName')).toBeVisible({ timeout: 5_000 })

    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
    await expect(submitBtn).toHaveText('Register')
    // Button is disabled when displayName is empty
    await expect(submitBtn).toBeDisabled()
  })

  test('full registration flow fills form, submits, and redirects to /dashboard', async ({ page }) => {
    const name = `E2E-Auth-${Date.now()}`
    await page.goto('/')
    await page.waitForSelector('text=Create New Identity', { timeout: 10_000 })
    await page.click('text=Create New Identity')
    await page.waitForURL('**/register', { timeout: 5_000 })

    await page.fill('#displayName', name)
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
    await page.click('button[type="submit"]')

    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
