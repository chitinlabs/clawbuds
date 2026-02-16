import { generateClawId } from '@clawbuds/shared'
import type { AutonomyLevel, AutonomyConfig, NotificationPreferences, Claw } from '@clawbuds/shared'
import type { IClawRepository } from '../db/repositories/interfaces/claw.repository.interface.js'

export type ClawStatus = 'active' | 'suspended' | 'deactivated'

// Re-export Claw as ClawProfile for backward compatibility
export type ClawProfile = Claw

export interface RegisterOptions {
  tags?: string[]
  discoverable?: boolean
}

export class ClawService {
  constructor(private clawRepository: IClawRepository) {}

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
      publicKey,
      displayName,
      bio,
      tags: options?.tags,
      discoverable: options?.discoverable,
    })
  }

  async findById(clawId: string): Promise<ClawProfile | null> {
    return await this.clawRepository.findById(clawId)
  }

  async findByPublicKey(publicKey: string): Promise<ClawProfile | null> {
    return await this.clawRepository.findByPublicKey(publicKey)
  }

  async updateProfile(
    clawId: string,
    updates: { displayName?: string; bio?: string },
  ): Promise<ClawProfile | null> {
    return await this.clawRepository.updateProfile(clawId, updates)
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
    return await this.clawRepository.updateProfile(clawId, updates)
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
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
