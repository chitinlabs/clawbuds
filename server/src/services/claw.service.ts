import { generateClawId } from '@clawbuds/shared'
import type { AutonomyLevel, AutonomyConfig, NotificationPreferences, Claw } from '@clawbuds/shared'
import type { IClawRepository } from '../db/repositories/interfaces/claw.repository.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import { config } from '../config/env.js'

export type ClawStatus = 'active' | 'suspended' | 'deactivated'

// Re-export Claw as ClawProfile for backward compatibility
export type ClawProfile = Claw

export interface RegisterOptions {
  tags?: string[]
  discoverable?: boolean
}

export class ClawService {
  constructor(
    private clawRepository: IClawRepository,
    private cache?: ICacheService,
  ) {}

  async register(publicKey: string, displayName: string, bio?: string, options?: RegisterOptions): Promise<ClawProfile> {
    const existing = await this.findByPublicKey(publicKey)
    if (existing) {
      throw new ConflictError('Public key already registered')
    }

    const clawId = generateClawId(publicKey)

    const existingId = await this.findById(clawId)
    if (existingId) {
      throw new ConflictError('ClawID collision, please generate a new key pair')
    }

    return await this.clawRepository.register({
      clawId,
      publicKey,
      displayName,
      bio,
      tags: options?.tags,
      discoverable: options?.discoverable,
    })
  }

  async findById(clawId: string): Promise<ClawProfile | null> {
    if (this.cache) {
      const cached = await this.cache.get<ClawProfile>(`claw:${clawId}`)
      if (cached) return cached
    }
    const claw = await this.clawRepository.findById(clawId)
    if (claw && this.cache) {
      await this.cache.set(`claw:${clawId}`, claw, config.cacheTtlClaw)
    }
    return claw
  }

  async findByPublicKey(publicKey: string): Promise<ClawProfile | null> {
    return await this.clawRepository.findByPublicKey(publicKey)
  }

  async updateProfile(
    clawId: string,
    updates: { displayName?: string; bio?: string },
  ): Promise<ClawProfile | null> {
    const result = await this.clawRepository.updateProfile(clawId, updates)
    if (result && this.cache) await this.cache.del(`claw:${clawId}`)
    return result
  }

  async updateExtendedProfile(
    clawId: string,
    updates: {
      displayName?: string
      bio?: string
      tags?: string[]
      discoverable?: boolean
      avatarUrl?: string
    },
  ): Promise<ClawProfile | null> {
    const result = await this.clawRepository.updateProfile(clawId, updates)
    if (result && this.cache) await this.cache.del(`claw:${clawId}`)
    return result
  }

  async getAutonomyConfig(clawId: string): Promise<{ autonomyLevel: AutonomyLevel; autonomyConfig: AutonomyConfig } | null> {
    const claw = await this.findById(clawId)
    if (!claw) return null
    return { autonomyLevel: claw.autonomyLevel, autonomyConfig: claw.autonomyConfig }
  }

  async updateAutonomyConfig(
    clawId: string,
    updates: { autonomyLevel?: AutonomyLevel; autonomyConfig?: AutonomyConfig },
  ): Promise<ClawProfile | null> {
    return await this.clawRepository.updateAutonomyConfig(clawId, updates)
  }

  async updateNotificationPrefs(clawId: string, prefs: NotificationPreferences): Promise<ClawProfile | null> {
    return await this.clawRepository.updateNotificationPrefs(clawId, prefs)
  }

  async updateLastSeen(clawId: string): Promise<void> {
    await this.clawRepository.updateLastSeen(clawId)
  }

  async savePushSubscription(clawId: string, data: {
    id: string
    endpoint: string
    keyP256dh: string
    keyAuth: string
  }): Promise<{ id: string; endpoint: string }> {
    return await this.clawRepository.savePushSubscription(clawId, data)
  }

  async deletePushSubscription(clawId: string, endpoint: string): Promise<boolean> {
    return await this.clawRepository.deletePushSubscription(clawId, endpoint)
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
