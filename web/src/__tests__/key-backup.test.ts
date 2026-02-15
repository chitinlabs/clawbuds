import { describe, it, expect } from 'vitest'
import { exportKeys, importKeys } from '../lib/key-backup'

describe('key-backup', () => {
  it('should export and import keys round-trip', async () => {
    const password = 'test-password-12345'
    const clawId = 'claw_test123'
    const displayName = 'TestClaw'
    const publicKey = 'pub_key_hex_string'
    const privateKey = 'priv_key_hex_string_that_is_secret'

    // Export
    const backup = await exportKeys(password, clawId, displayName, publicKey, privateKey)

    // Verify backup structure
    expect(backup.version).toBe(1)
    expect(backup.type).toBe('clawbuds-key-backup')
    expect(backup.clawId).toBe(clawId)
    expect(backup.displayName).toBe(displayName)
    expect(backup.publicKey).toBe(publicKey)
    expect(backup.encryptedPrivateKey).toBeDefined()
    expect(backup.salt).toBeDefined()
    expect(backup.iv).toBeDefined()
    expect(backup.createdAt).toBeDefined()

    // Encrypted private key should not be the original
    expect(backup.encryptedPrivateKey).not.toBe(privateKey)

    // Import with correct password
    const result = await importKeys(backup, password)
    expect(result.publicKey).toBe(publicKey)
    expect(result.privateKey).toBe(privateKey)
  })

  it('should fail import with wrong password', async () => {
    const backup = await exportKeys(
      'correct-password',
      'claw_test',
      'Test',
      'pub',
      'priv_secret',
    )

    await expect(importKeys(backup, 'wrong-password')).rejects.toThrow()
  })

  it('should produce different outputs for same input', async () => {
    const args = ['password', 'claw_1', 'Name', 'pub', 'priv'] as const
    const backup1 = await exportKeys(...args)
    const backup2 = await exportKeys(...args)

    // Salt and IV should differ (random)
    expect(backup1.salt).not.toBe(backup2.salt)
    expect(backup1.iv).not.toBe(backup2.iv)
    expect(backup1.encryptedPrivateKey).not.toBe(backup2.encryptedPrivateKey)
  })

  it('should preserve all metadata in backup', async () => {
    const backup = await exportKeys('pw', 'claw_xyz', 'MyBot', 'pk', 'sk')

    expect(backup.clawId).toBe('claw_xyz')
    expect(backup.displayName).toBe('MyBot')
    expect(new Date(backup.createdAt).getTime()).toBeGreaterThan(0)
  })
})
