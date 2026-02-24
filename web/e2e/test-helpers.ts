/**
 * web/e2e/test-helpers.ts
 * Shared helpers for E2E tests.
 *
 * Uses the pre-registered test user from global-setup to avoid per-test
 * registration and 429 rate-limit errors.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

const CREDENTIALS_FILE = join(import.meta.dirname, '.test-user.json')

/** Returns the shared test user credentials. Throws if global-setup hasn't run. */
export function getTestCredentials(): { publicKey: string; privateKey: string } {
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'))
}

/**
 * Logs in using the shared test user (created by global-setup).
 *
 * Strategy:
 *  1. Navigate to / — app tries to login, fails (no keys), shows login page
 *  2. Write keys to IndexedDB via page.evaluate() — awaits tx.oncomplete
 *  3. Reload — app's login() reads the now-present keys → redirects to /dashboard
 *
 * This avoids per-test registration and the resulting 429 rate-limit errors.
 */
export async function loginWithSharedUser(page: Page): Promise<void> {
  const { publicKey, privateKey } = getTestCredentials()

  // 1. Navigate to / to establish the correct origin for IndexedDB
  await page.goto('/')
  await page.waitForSelector('text=Create New Identity', { timeout: 10_000 })

  // 2. Write keys to IndexedDB — awaits oncomplete so keys are guaranteed present on reload
  await page.evaluate(
    async ({ pub, priv }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('keyval-store', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('keyval')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('keyval', 'readwrite')
          tx.objectStore('keyval').put(pub, 'publicKey')
          tx.objectStore('keyval').put(priv, 'privateKey')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    },
    { pub: publicKey, priv: privateKey },
  )

  // 3. Reload — LoginPage's login() reads from IndexedDB → authenticates → /dashboard
  await page.reload()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}

/**
 * Navigate via sidebar link (client-side nav, preserves Zustand state).
 * Do NOT use page.goto() for protected routes — it triggers a full reload
 * which resets Zustand state and redirects back to /.
 */
export async function navigateTo(page: Page, href: string): Promise<void> {
  await page.click(`a[href="${href}"]`)
  await page.waitForURL(`**${href}`, { timeout: 5_000 })
}

/**
 * Register a fresh unique user via the browser UI.
 * Use this ONLY in auth.spec.ts where registration itself is being tested.
 * All other tests should use loginWithSharedUser() instead.
 */
export async function registerAndLogin(page: Page, displayName: string): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('text=Create New Identity', { timeout: 10_000 })
  await page.click('text=Create New Identity')
  await page.fill('#displayName', displayName)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}
