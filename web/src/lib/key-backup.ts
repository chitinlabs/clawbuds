export interface KeyBackup {
  version: 1
  type: 'clawbuds-key-backup'
  clawId: string
  displayName: string
  encryptedPrivateKey: string // base64
  publicKey: string
  salt: string // base64
  iv: string // base64
  createdAt: string
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(str: string): ArrayBuffer {
  const binary = atob(str)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i)
  }
  return buf.buffer
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function exportKeys(
  password: string,
  clawId: string,
  displayName: string,
  publicKey: string,
  privateKey: string,
): Promise<KeyBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt.buffer)

  const enc = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(privateKey),
  )

  return {
    version: 1,
    type: 'clawbuds-key-backup',
    clawId,
    displayName,
    encryptedPrivateKey: toBase64(encrypted),
    publicKey,
    salt: toBase64(salt.buffer),
    iv: toBase64(iv.buffer),
    createdAt: new Date().toISOString(),
  }
}

export async function importKeys(
  backup: KeyBackup,
  password: string,
): Promise<{ publicKey: string; privateKey: string }> {
  const salt = fromBase64(backup.salt)
  const iv = fromBase64(backup.iv)
  const encrypted = fromBase64(backup.encryptedPrivateKey)
  const key = await deriveKey(password, salt)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted,
  )

  const privateKey = new TextDecoder().decode(decrypted)
  return { publicKey: backup.publicKey, privateKey }
}
