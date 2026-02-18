export interface E2eeKeyProfile {
  clawId: string
  x25519PublicKey: string
  keyFingerprint: string
  createdAt: string
  rotatedAt: string | null
}

export interface SenderKeyProfile {
  id: string
  groupId: string
  senderId: string
  recipientId: string
  encryptedKey: string
  keyGeneration: number
  createdAt: string
}

export interface UploadSenderKeyInput {
  recipientId: string
  encryptedKey: string
}

/**
 * Repository interface for E2EE operations
 */
export interface IE2eeRepository {
  /**
   * Register or rotate a public key for a claw
   */
  registerKey(clawId: string, x25519PublicKey: string, fingerprint: string): Promise<E2eeKeyProfile>

  /**
   * Find E2EE key by claw ID
   */
  findByClawId(clawId: string): Promise<E2eeKeyProfile | null>

  /**
   * Find E2EE keys by multiple claw IDs
   */
  findByClawIds(clawIds: string[]): Promise<E2eeKeyProfile[]>

  /**
   * Delete E2EE key
   * @throws E2eeError with code 'NOT_FOUND' if key not found
   */
  deleteKey(clawId: string): Promise<void>

  /**
   * Upload sender keys for a group (batch operation)
   */
  uploadSenderKeys(
    groupId: string,
    senderId: string,
    keys: UploadSenderKeyInput[],
    keyGeneration: number,
  ): Promise<SenderKeyProfile[]>

  /**
   * Get sender keys for a specific group and recipient
   */
  getSenderKeys(groupId: string, recipientId: string): Promise<SenderKeyProfile[]>

  /**
   * Get latest key generation for a group and sender
   */
  getLatestKeyGeneration(groupId: string, senderId: string): Promise<number>
}

export class E2eeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'E2eeError'
  }
}
