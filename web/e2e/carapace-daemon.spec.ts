/**
 * web/e2e/carapace-daemon.spec.ts
 * E2E test: verifies that the Carapace page connects to the local daemon.
 *
 * Prerequisites (must be running before the test):
 *   1. server:   cd server && pnpm dev            (port 8765)
 *   2. web:      cd web && pnpm dev               (port 5173)
 *   3. daemon:   node /opt/homebrew/lib/node_modules/clawbuds/dist/daemon.js
 *                or: node skill/dist/daemon.js    (port 7878)
 */
import { test, expect } from '@playwright/test'
import { loginWithSharedUser, navigateTo } from './test-helpers.js'

/** Navigate to /carapace via sidebar link (client-side nav, preserves Zustand state) */
async function goToCarapace(page: import('@playwright/test').Page) {
  await page.click('a[href="/carapace"]')
  await page.waitForURL('**/carapace', { timeout: 5_000 })
}

// Helper: check if daemon is reachable from Node.js (not browser)
async function isDaemonRunning(): Promise<boolean> {
  return fetch('http://127.0.0.1:7878/local/status', {
    signal: AbortSignal.timeout(500),
  })
    .then((r) => r.ok)
    .catch(() => false)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Carapace page — daemon connectivity', () => {
  test('should show textarea when daemon is reachable', async ({ page }) => {
    test.skip(!(await isDaemonRunning()), 'Daemon not running — skipping')

    await loginWithSharedUser(page)
    await goToCarapace(page)

    const textarea = page.locator('textarea')
    const daemonWarning = page.locator('text=Daemon not available')

    await expect(page.locator('h1', { hasText: 'Carapace Editor' })).toBeVisible({ timeout: 5_000 })
    await expect(textarea).toBeVisible({ timeout: 5_000 })
    await expect(daemonWarning).not.toBeVisible()
  })

  test('should show Daemon-not-available warning when daemon is down', async ({ page }) => {
    test.skip(await isDaemonRunning(), 'Daemon is running — skipping fallback UI test')

    await loginWithSharedUser(page)
    await goToCarapace(page)

    await expect(page.locator('h1', { hasText: 'Carapace Editor' })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Daemon not available')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea')).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Carapace page — editor interactions', () => {
  test('should allow editing and saving carapace content', async ({ page }) => {
    test.skip(!(await isDaemonRunning()), 'Daemon not running — skipping editor test')

    await loginWithSharedUser(page)
    await goToCarapace(page)

    await expect(page.locator('h1', { hasText: 'Carapace Editor' })).toBeVisible({ timeout: 5_000 })

    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 5_000 })

    // Use unique content so Save is enabled even if daemon already has content
    const uniqueContent = `# My Carapace\n\nE2E test run: ${Date.now()}`
    await textarea.fill(uniqueContent)

    const saveBtn = page.locator('button', { hasText: 'Save' })
    await expect(saveBtn).toBeEnabled({ timeout: 2_000 })
    await saveBtn.click()

    await expect(page.locator('text=/Saved as version \\d+/')).toBeVisible({ timeout: 8_000 })
  })

  test('should sync carapace from server', async ({ page }) => {
    test.skip(!(await isDaemonRunning()), 'Daemon not running — skipping sync test')

    await loginWithSharedUser(page)
    await goToCarapace(page)

    await expect(page.locator('h1', { hasText: 'Carapace Editor' })).toBeVisible({ timeout: 5_000 })

    const syncBtn = page.locator('button', { hasText: 'Sync from Server' })
    await expect(syncBtn).toBeVisible({ timeout: 5_000 })

    await syncBtn.click()

    await page.waitForTimeout(2_000)
    await expect(page.locator('textarea')).toBeVisible()
  })
})
