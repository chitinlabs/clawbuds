import { describe, it, expect } from 'vitest'
import {
  generateKeyPair,
  ed25519PrivateToX25519,
  x25519GetPublicKey,
  x25519SharedSecret,
  deriveSessionKey,
  aesEncrypt,
  aesDecrypt,
  keyFingerprint,
} from '../src/index.js'

describe('X25519 Crypto', () => {
  it('should convert Ed25519 private key to X25519', () => {
    const keys = generateKeyPair()
    const x25519Private = ed25519PrivateToX25519(keys.privateKey)
    expect(x25519Private).toHaveLength(64) // 32 bytes hex
    expect(x25519Private).not.toBe(keys.privateKey)
  })

  it('should derive X25519 public key', () => {
    const keys = generateKeyPair()
    const x25519Private = ed25519PrivateToX25519(keys.privateKey)
    const x25519Public = x25519GetPublicKey(x25519Private)
    expect(x25519Public).toHaveLength(64)
  })

  it('should compute same shared secret from both sides', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const aliceX25519Public = x25519GetPublicKey(aliceX25519Private)

    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)

    const sharedAB = x25519SharedSecret(aliceX25519Private, bobX25519Public)
    const sharedBA = x25519SharedSecret(bobX25519Private, aliceX25519Public)

    expect(sharedAB.toString('hex')).toBe(sharedBA.toString('hex'))
  })

  it('should derive session key via HKDF', async () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)

    const shared = x25519SharedSecret(aliceX25519Private, bobX25519Public)
    const sessionKey = await deriveSessionKey(shared, 'test-conversation-id')

    expect(sessionKey).toHaveLength(32) // 256 bits
  })

  it('should derive same session key from both sides', async () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const aliceX25519Public = x25519GetPublicKey(aliceX25519Private)
    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)

    const sharedAB = x25519SharedSecret(aliceX25519Private, bobX25519Public)
    const sharedBA = x25519SharedSecret(bobX25519Private, aliceX25519Public)

    const salt = 'conversation-123'
    const keyA = await deriveSessionKey(sharedAB, salt)
    const keyB = await deriveSessionKey(sharedBA, salt)

    expect(keyA.toString('hex')).toBe(keyB.toString('hex'))
  })

  it('should encrypt and decrypt with AES-256-GCM', async () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)
    const aliceX25519Public = x25519GetPublicKey(aliceX25519Private)

    // Alice encrypts
    const sharedAB = x25519SharedSecret(aliceX25519Private, bobX25519Public)
    const sessionKeyAlice = await deriveSessionKey(sharedAB, 'conv-1')
    const plaintext = JSON.stringify([{ type: 'text', text: 'Secret message!' }])
    const { ciphertext, nonce } = aesEncrypt(sessionKeyAlice, plaintext)

    expect(ciphertext).not.toBe(plaintext)

    // Bob decrypts
    const sharedBA = x25519SharedSecret(bobX25519Private, aliceX25519Public)
    const sessionKeyBob = await deriveSessionKey(sharedBA, 'conv-1')
    const decrypted = aesDecrypt(sessionKeyBob, ciphertext, nonce)

    expect(decrypted).toBe(plaintext)
  })

  it('should fail to decrypt with wrong key', async () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const charlie = generateKeyPair()

    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)
    const charlieX25519Private = ed25519PrivateToX25519(charlie.privateKey)
    const aliceX25519Public = x25519GetPublicKey(aliceX25519Private)

    const shared = x25519SharedSecret(aliceX25519Private, bobX25519Public)
    const sessionKey = await deriveSessionKey(shared, 'conv-1')
    const { ciphertext, nonce } = aesEncrypt(sessionKey, 'Secret!')

    // Charlie tries to decrypt with wrong shared secret
    const wrongShared = x25519SharedSecret(charlieX25519Private, aliceX25519Public)
    const wrongKey = await deriveSessionKey(wrongShared, 'conv-1')

    expect(() => aesDecrypt(wrongKey, ciphertext, nonce)).toThrow()
  })

  it('should generate key fingerprint', () => {
    const keys = generateKeyPair()
    const x25519Private = ed25519PrivateToX25519(keys.privateKey)
    const x25519Public = x25519GetPublicKey(x25519Private)
    const fp = keyFingerprint(x25519Public)

    expect(fp).toHaveLength(16)
    expect(fp).toMatch(/^[0-9a-f]+$/)
  })

  it('should generate different fingerprints for different keys', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const alicePriv = ed25519PrivateToX25519(alice.privateKey)
    const alicePub = x25519GetPublicKey(alicePriv)
    const bobPriv = ed25519PrivateToX25519(bob.privateKey)
    const bobPub = x25519GetPublicKey(bobPriv)

    expect(keyFingerprint(alicePub)).not.toBe(keyFingerprint(bobPub))
  })
})
