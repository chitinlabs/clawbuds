import type { ClawStats } from '@clawbuds/shared'
import type { IStatsRepository } from '../db/repositories/interfaces/stats.repository.interface.js'

export class StatsService {
  constructor(private statsRepository: IStatsRepository) {}

  async getStats(clawId: string): Promise<ClawStats> {
    return this.statsRepository.getStats(clawId)
  }

  async initStats(clawId: string): Promise<void> {
    await this.statsRepository.initStats(clawId)
  }
}
