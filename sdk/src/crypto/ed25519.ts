import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, randomBytes } from '@noble/hashes/utils'

export interface KeyPair {
  publicKey: string // hex
  privateKey: string // hex
}

export function generateKeyPair(): KeyPair {
  const privateKeyBytes = ed25519.utils.randomPrivateKey()
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes)
  return {
    publicKey: bytesToHex(publicKeyBytes),
    privateKey: bytesToHex(privateKeyBytes),
  }
}

export function sign(message: string, privateKey: string): string {
  const msgBytes = new TextEncoder().encode(message)
  const signature = ed25519.sign(msgBytes, privateKey)
  return bytesToHex(signature)
}

export function verify(signature: string, message: string, publicKey: string): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message)
    return ed25519.verify(signature, msgBytes, publicKey)
  } catch {
    return false
  }
}

export function sha256hex(data: string): string {
  const bytes = new TextEncoder().encode(data)
  return bytesToHex(sha256(bytes))
}

export function generateClawId(publicKey: string): string {
  const hash = sha256hex(publicKey)
  return `claw_${hash.slice(0, 16)}`
}

export function buildSignMessage(
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  const bodyHash = sha256hex(body || '')
  return `${method}|${path}|${timestamp}|${bodyHash}`
}

export function generateNonce(): string {
  return bytesToHex(randomBytes(16))
}
