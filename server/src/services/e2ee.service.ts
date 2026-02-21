import type { EventBus } from './event-bus.js'
import { keyFingerprint } from '../lib/sign-protocol.js'
import type { IE2eeRepository, E2eeKeyProfile, SenderKeyProfile, UploadSenderKeyInput } from '../db/repositories/interfaces/e2ee.repository.interface.js'
import { E2eeError } from '../db/repositories/interfaces/e2ee.repository.interface.js'

export type { E2eeKeyProfile, SenderKeyProfile, UploadSenderKeyInput } from '../db/repositories/interfaces/e2ee.repository.interface.js'
export { E2eeError } from '../db/repositories/interfaces/e2ee.repository.interface.js'

export class E2eeService {
  constructor(
    private e2eeRepository: IE2eeRepository,
    private eventBus?: EventBus,
  ) {}

  async registerKey(clawId: string, x25519PublicKey: string): Promise<E2eeKeyProfile> {
    const fingerprint = keyFingerprint(x25519PublicKey)
    const existing = await this.findByClawId(clawId)

    const result = await this.e2eeRepository.registerKey(clawId, x25519PublicKey, fingerprint)

    if (existing && this.eventBus) {
      this.eventBus.emit('e2ee.key_updated', { clawId, fingerprint })
    }

    return result
  }

  async findByClawId(clawId: string): Promise<E2eeKeyProfile | null> {
    return this.e2eeRepository.findByClawId(clawId)
  }

  async findByClawIds(clawIds: string[]): Promise<E2eeKeyProfile[]> {
    return this.e2eeRepository.findByClawIds(clawIds)
  }

  async deleteKey(clawId: string): Promise<void> {
    await this.e2eeRepository.deleteKey(clawId)
  }

  async uploadSenderKeys(
    groupId: string,
    senderId: string,
    keys: UploadSenderKeyInput[],
    keyGeneration?: number,
  ): Promise<SenderKeyProfile[]> {
    const gen = keyGeneration ?? await this.getNextKeyGeneration(groupId, senderId)
    return this.e2eeRepository.uploadSenderKeys(groupId, senderId, keys, gen)
  }

  async getSenderKeys(groupId: string, recipientId: string): Promise<SenderKeyProfile[]> {
    return this.e2eeRepository.getSenderKeys(groupId, recipientId)
  }

  async getLatestKeyGeneration(groupId: string, senderId: string): Promise<number> {
    return this.e2eeRepository.getLatestKeyGeneration(groupId, senderId)
  }

  private async getNextKeyGeneration(groupId: string, senderId: string): Promise<number> {
    return await this.getLatestKeyGeneration(groupId, senderId) + 1
  }
}
