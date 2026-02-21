import { describe, it, expect } from 'vitest'
import {
  buildSignMessage,
  sign,
  generateKeyPair,
  sha256hex,
  generateClawId,
} from '../src/lib/sign-protocol.js'

describe('skill/sign-protocol', () => {
  describe('generateKeyPair', () => {
    it('should generate valid ed25519 key pair', () => {
      const kp = generateKeyPair()
      expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/)
      expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('buildSignMessage', () => {
    it('should produce deterministic output', () => {
      const msg1 = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const msg2 = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      expect(msg1).toBe(msg2)
    })

    it('should match server sign-protocol format', () => {
      // Format: METHOD|PATH|TIMESTAMP|SHA256_OF_BODY
      const msg = buildSignMessage('POST', '/api/v1/messages', '9999', '{"test":1}')
      const parts = msg.split('|')
      expect(parts).toHaveLength(4)
      expect(parts[0]).toBe('POST')
      expect(parts[1]).toBe('/api/v1/messages')
      expect(parts[2]).toBe('9999')
      expect(parts[3]).toBe(sha256hex('{"test":1}'))
    })
  })

  describe('sign', () => {
    it('should produce a hex signature', () => {
      const kp = generateKeyPair()
      const message = buildSignMessage('GET', '/api/v1/me', '1234567890', '')
      const signature = sign(message, kp.privateKey)
      expect(signature).toMatch(/^[0-9a-f]{128}$/)
    })
  })

  describe('generateClawId', () => {
    it('should produce claw_ prefixed id', () => {
      const kp = generateKeyPair()
      expect(generateClawId(kp.publicKey)).toMatch(/^claw_[0-9a-f]{16}$/)
    })
  })
})
