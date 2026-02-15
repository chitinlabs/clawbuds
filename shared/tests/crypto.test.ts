import { describe, it, expect } from 'vitest'
import {
  generateKeyPair,
  sign,
  verify,
  sha256hex,
  generateClawId,
  buildSignMessage,
  generateNonce,
} from '../src/crypto/ed25519.js'

describe('Ed25519 crypto', () => {
  describe('generateKeyPair', () => {
    it('should generate valid key pair with hex strings', () => {
      const keys = generateKeyPair()
      expect(keys.publicKey).toMatch(/^[0-9a-f]{64}$/)
      expect(keys.privateKey).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should generate different key pairs each time', () => {
      const a = generateKeyPair()
      const b = generateKeyPair()
      expect(a.publicKey).not.toBe(b.publicKey)
      expect(a.privateKey).not.toBe(b.privateKey)
    })
  })

  describe('sign / verify', () => {
    it('should sign and verify a message', () => {
      const keys = generateKeyPair()
      const message = 'GET|/api/v1/me|1700000000|abc123'
      const signature = sign(message, keys.privateKey)

      expect(signature).toMatch(/^[0-9a-f]+$/)
      expect(verify(signature, message, keys.publicKey)).toBe(true)
    })

    it('should reject tampered message', () => {
      const keys = generateKeyPair()
      const signature = sign('original', keys.privateKey)
      expect(verify(signature, 'tampered', keys.publicKey)).toBe(false)
    })

    it('should reject wrong public key', () => {
      const alice = generateKeyPair()
      const bob = generateKeyPair()
      const signature = sign('hello', alice.privateKey)
      expect(verify(signature, 'hello', bob.publicKey)).toBe(false)
    })

    it('should return false for invalid signature format', () => {
      const keys = generateKeyPair()
      expect(verify('not-hex', 'hello', keys.publicKey)).toBe(false)
    })

    it('should return false for empty signature', () => {
      const keys = generateKeyPair()
      expect(verify('', 'hello', keys.publicKey)).toBe(false)
    })
  })

  describe('sha256hex', () => {
    it('should return consistent hash', () => {
      const hash = sha256hex('hello')
      expect(hash).toBe(sha256hex('hello'))
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should return different hashes for different inputs', () => {
      expect(sha256hex('a')).not.toBe(sha256hex('b'))
    })

    it('should handle empty string', () => {
      const hash = sha256hex('')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('generateClawId', () => {
    it('should return claw_ prefixed id with 16 hex chars', () => {
      const keys = generateKeyPair()
      const clawId = generateClawId(keys.publicKey)
      expect(clawId).toMatch(/^claw_[0-9a-f]{16}$/)
    })

    it('should be deterministic for same public key', () => {
      const keys = generateKeyPair()
      expect(generateClawId(keys.publicKey)).toBe(generateClawId(keys.publicKey))
    })

    it('should differ for different public keys', () => {
      const a = generateKeyPair()
      const b = generateKeyPair()
      expect(generateClawId(a.publicKey)).not.toBe(generateClawId(b.publicKey))
    })
  })

  describe('buildSignMessage', () => {
    it('should build pipe-separated message with body hash', () => {
      const msg = buildSignMessage('POST', '/api/v1/register', '1700000000', '{"key":"value"}')
      const parts = msg.split('|')
      expect(parts).toHaveLength(4)
      expect(parts[0]).toBe('POST')
      expect(parts[1]).toBe('/api/v1/register')
      expect(parts[2]).toBe('1700000000')
      expect(parts[3]).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should hash empty string for GET requests', () => {
      const msg = buildSignMessage('GET', '/api/v1/me', '1700000000', '')
      const parts = msg.split('|')
      expect(parts[3]).toBe(sha256hex(''))
    })
  })

  describe('generateNonce', () => {
    it('should return 32-char hex string', () => {
      const nonce = generateNonce()
      expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    })

    it('should be unique each time', () => {
      const a = generateNonce()
      const b = generateNonce()
      expect(a).not.toBe(b)
    })
  })
})
