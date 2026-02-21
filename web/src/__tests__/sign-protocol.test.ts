import { describe, it, expect } from 'vitest'
import {
  buildSignMessage,
  sign,
  generateKeyPair,
  sha256hex,
  generateClawId,
} from '../lib/sign-protocol.js'

describe('web/sign-protocol', () => {
  it('should generate valid key pair', () => {
    const kp = generateKeyPair()
    expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should build deterministic sign message', () => {
    const m1 = buildSignMessage('GET', '/api/v1/me', '123', '')
    const m2 = buildSignMessage('GET', '/api/v1/me', '123', '')
    expect(m1).toBe(m2)
  })

  it('should match FORMAT: METHOD|PATH|TIMESTAMP|SHA256_BODY', () => {
    const msg = buildSignMessage('POST', '/api/v1/messages', '9999', 'hello')
    const parts = msg.split('|')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('POST')
    expect(parts[1]).toBe('/api/v1/messages')
    expect(parts[2]).toBe('9999')
    expect(parts[3]).toBe(sha256hex('hello'))
  })

  it('should produce valid signature', () => {
    const kp = generateKeyPair()
    const msg = buildSignMessage('GET', '/api/v1/me', '123', '')
    const sig = sign(msg, kp.privateKey)
    expect(sig).toMatch(/^[0-9a-f]{128}$/)
  })

  it('should generate claw_ prefixed id', () => {
    const kp = generateKeyPair()
    expect(generateClawId(kp.publicKey)).toMatch(/^claw_[0-9a-f]{16}$/)
  })
})
