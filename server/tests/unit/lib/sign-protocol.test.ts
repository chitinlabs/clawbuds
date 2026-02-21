import { describe, it, expect } from 'vitest'
import {
  buildSignMessage,
  verify,
  sign,
  generateKeyPair,
  sha256hex,
  generateClawId,
  generateNonce,
} from '../../../src/lib/sign-protocol.js'

describe('sign-protocol', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid ed25519 key pair', () => {
      const kp = generateKeyPair()
      expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/)
      expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should generate unique key pairs each time', () => {
      const kp1 = generateKeyPair()
      const kp2 = generateKeyPair()
      expect(kp1.publicKey).not.toBe(kp2.publicKey)
      expect(kp1.privateKey).not.toBe(kp2.privateKey)
    })
  })

  describe('buildSignMessage', () => {
    it('should produce deterministic output for same inputs', () => {
      const msg1 = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const msg2 = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      expect(msg1).toBe(msg2)
    })

    it('should differ when method changes', () => {
      const msg1 = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const msg2 = buildSignMessage('POST', '/api/v1/me', '1234567890', '')
      expect(msg1).not.toBe(msg2)
    })

    it('should include sha256 of body', () => {
      const bodyContent = '{"test":1}'
      const msg = buildSignMessage('POST', '/api/v1/messages', '1234567890', bodyContent)
      const expected = sha256hex(bodyContent)
      expect(msg).toContain(expected)
    })

    it('should use sha256 of empty string for empty body', () => {
      const msg = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const emptyHash = sha256hex('')
      expect(msg).toContain(emptyHash)
    })
  })

  describe('sign and verify', () => {
    it('should verify a signed message', () => {
      const kp = generateKeyPair()
      const message = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const signature = sign(message, kp.privateKey)
      expect(verify(signature, message, kp.publicKey)).toBe(true)
    })

    it('should reject invalid signature', () => {
      const kp = generateKeyPair()
      const message = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const wrongKp = generateKeyPair()
      const signature = sign(message, wrongKp.privateKey)
      expect(verify(signature, message, kp.publicKey)).toBe(false)
    })

    it('should reject modified message', () => {
      const kp = generateKeyPair()
      const message = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const signature = sign(message, kp.privateKey)
      const tampered = message + 'x'
      expect(verify(signature, tampered, kp.publicKey)).toBe(false)
    })

    it('should return false for malformed signature', () => {
      const kp = generateKeyPair()
      const message = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      expect(verify('notasignature', message, kp.publicKey)).toBe(false)
    })
  })

  describe('sha256hex', () => {
    it('should produce hex output', () => {
      expect(sha256hex('hello')).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce same output for same input', () => {
      expect(sha256hex('hello')).toBe(sha256hex('hello'))
    })

    it('should produce different output for different inputs', () => {
      expect(sha256hex('hello')).not.toBe(sha256hex('world'))
    })
  })

  describe('generateClawId', () => {
    it('should produce claw_ prefixed id', () => {
      const kp = generateKeyPair()
      expect(generateClawId(kp.publicKey)).toMatch(/^claw_[0-9a-f]{16}$/)
    })
  })

  describe('generateNonce', () => {
    it('should produce a hex string', () => {
      expect(generateNonce()).toMatch(/^[0-9a-f]{32}$/)
    })

    it('should produce unique nonces', () => {
      expect(generateNonce()).not.toBe(generateNonce())
    })
  })
})
