/**
 * web/e2e/global-setup.ts
 * Playwright global setup: registers ONE shared test user before all tests.
 *
 * Credentials are saved to e2e/.test-user.json and injected into each
 * test's IndexedDB via addInitScript — avoiding per-test registration
 * and the resulting 429 rate-limit errors.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const SERVER_URL = 'http://localhost:8765'
const CREDENTIALS_FILE = join(import.meta.dirname, '.test-user.json')

function generateKeyPair() {
  const privBytes = ed25519.utils.randomPrivateKey()
  const pubBytes = ed25519.getPublicKey(privBytes)
  return { publicKey: bytesToHex(pubBytes), privateKey: bytesToHex(privBytes) }
}

function sha256hex(data: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(data)))
}

function generateClawId(publicKey: string): string {
  return `claw_${sha256hex(publicKey).slice(0, 16)}`
}

function buildSignMessage(method: string, path: string, timestamp: string, body: string): string {
  return `${method}|${path}|${timestamp}|${sha256hex(body || '')}`
}

function sign(message: string, privateKey: string): string {
  return bytesToHex(ed25519.sign(new TextEncoder().encode(message), privateKey))
}

async function signedFetch(
  url: string,
  options: { method: string; body?: string },
  clawId: string,
  privateKey: string,
) {
  const timestamp = Date.now().toString()
  const urlObj = new URL(url)
  const path = urlObj.pathname
  const msg = buildSignMessage(options.method, path, timestamp, options.body ?? '')
  const sig = sign(msg, privateKey)

  return fetch(url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Claw-Id': clawId,
      'X-Claw-Timestamp': timestamp,
      'X-Claw-Signature': sig,
    },
    body: options.body,
  })
}

export default async function globalSetup() {
  // Re-use credentials if already registered in this dev session
  if (existsSync(CREDENTIALS_FILE)) {
    const cached = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'))
    // Verify the user still exists on the server
    const clawId = generateClawId(cached.publicKey)
    try {
      const res = await signedFetch(
        `${SERVER_URL}/api/v1/me`,
        { method: 'GET' },
        clawId,
        cached.privateKey,
      )
      if (res.ok) {
        console.log(`[global-setup] Reusing existing test user: ${clawId}`)
        return
      }
    } catch {
      // Fall through to re-register
    }
  }

  // Register a fresh test user
  const { publicKey, privateKey } = generateKeyPair()
  const clawId = generateClawId(publicKey)

  const res = await fetch(`${SERVER_URL}/api/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, displayName: 'E2E Test User' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[global-setup] Registration failed (${res.status}): ${text}`)
  }

  writeFileSync(CREDENTIALS_FILE, JSON.stringify({ publicKey, privateKey }), 'utf-8')
  console.log(`[global-setup] Registered new test user: ${clawId}`)
}
