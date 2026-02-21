import { x25519 } from '@noble/curves/ed25519'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { hkdf } from 'node:crypto'

/**
 * Convert Ed25519 private key to X25519 private key.
 * Uses SHA-512 hash of the private key, taking the first 32 bytes and clamping.
 */
export function ed25519PrivateToX25519(ed25519PrivateKey: string): string {
  const privBytes = Buffer.from(ed25519PrivateKey, 'hex')
  const hash = createHash('sha512').update(privBytes).digest()
  // Clamp the first 32 bytes (X25519 key clamping)
  hash[0] &= 248
  hash[31] &= 127
  hash[31] |= 64
  const x25519Private = hash.subarray(0, 32)
  return Buffer.from(x25519Private).toString('hex')
}

/**
 * Derive X25519 public key from X25519 private key.
 */
export function x25519GetPublicKey(x25519PrivateKey: string): string {
  const privBytes = Buffer.from(x25519PrivateKey, 'hex')
  const pubBytes = x25519.getPublicKey(privBytes)
  return Buffer.from(pubBytes).toString('hex')
}

/**
 * Perform X25519 ECDH key exchange.
 * Returns shared secret.
 */
export function x25519SharedSecret(myPrivateKey: string, theirPublicKey: string): Buffer {
  const privBytes = Buffer.from(myPrivateKey, 'hex')
  const pubBytes = Buffer.from(theirPublicKey, 'hex')
  const shared = x25519.getSharedSecret(privBytes, pubBytes)
  return Buffer.from(shared)
}

/**
 * Derive session key using HKDF-SHA256.
 */
export function deriveSessionKey(sharedSecret: Buffer, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    hkdf('sha256', sharedSecret, salt, 'clawbuds-e2ee-v1', 32, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(Buffer.from(derivedKey))
    })
  })
}

/**
 * Encrypt data with AES-256-GCM.
 * Returns { ciphertext, nonce } both as base64.
 */
export function aesEncrypt(
  sessionKey: Buffer,
  plaintext: string,
): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sessionKey, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Concatenate ciphertext + authTag
  const combined = Buffer.concat([encrypted, authTag])
  return {
    ciphertext: combined.toString('base64'),
    nonce: nonce.toString('base64'),
  }
}

/**
 * Decrypt data with AES-256-GCM.
 * Returns plaintext string.
 */
export function aesDecrypt(
  sessionKey: Buffer,
  ciphertext: string,
  nonce: string,
): string {
  const nonceBytes = Buffer.from(nonce, 'base64')
  const combined = Buffer.from(ciphertext, 'base64')
  // Last 16 bytes are the auth tag
  const encrypted = combined.subarray(0, combined.length - 16)
  const authTag = combined.subarray(combined.length - 16)

  const decipher = createDecipheriv('aes-256-gcm', sessionKey, nonceBytes)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf-8')
}

/**
 * Generate key fingerprint (SHA-256 of public key, first 16 hex chars).
 */
export function keyFingerprint(publicKeyHex: string): string {
  return createHash('sha256').update(publicKeyHex).digest('hex').slice(0, 16)
}
