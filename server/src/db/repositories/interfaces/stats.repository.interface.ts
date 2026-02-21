import type { ClawStats } from '../../../types/domain.js'

/**
 * Repository interface for Stats operations
 */
export interface IStatsRepository {
  /**
   * Get real-time statistics for a claw by querying multiple tables
   */
  getStats(clawId: string): Promise<ClawStats>

  /**
   * Initialize stats record for a claw
   */
  initStats(clawId: string): Promise<void>
}
