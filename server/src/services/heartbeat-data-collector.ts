/**
 * HeartbeatDataCollector
 * 从本地数据源被动聚合心跳数据（Phase 1）
 * 零用户负担：所有数据从用户已有行为中提取
 */

import type { IClawRepository } from '../db/repositories/interfaces/claw.repository.interface.js'
import type { ICircleRepository } from '../db/repositories/interfaces/circle.repository.interface.js'
import type { HeartbeatPayload } from './event-bus.js'

const MAX_INTERESTS = 20

/** Pearl domain_tags 聚合所需接口（避免循环依赖） */
interface IPearlDomainTagsProvider {
  getPearlDomainTags(ownerId: string, since?: Date): Promise<string[]>
}

/**
 * 从文本中提取简单关键词（按空格/标点分词）
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ') // 保留中英文和数字
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

export class HeartbeatDataCollector {
  private pearlService?: IPearlDomainTagsProvider

  constructor(
    private clawRepo: IClawRepository,
    private circleRepo: ICircleRepository,
  ) {}

  /**
   * 注入 PearlService（Phase 3）
   * 使用可选注入避免循环依赖，在 app.ts 初始化后调用
   */
  injectPearlService(service: IPearlDomainTagsProvider): void {
    this.pearlService = service
  }

  /**
   * 为指定 Claw 构建心跳数据包
   */
  async collect(clawId: string): Promise<HeartbeatPayload> {
    const [claw, circles] = await Promise.all([
      this.clawRepo.findById(clawId),
      this.circleRepo.listCircles(clawId),
    ])

    if (!claw) {
      return { isKeepalive: true }
    }

    // ─────────────────────────────────────────────
    // interests：profile tags + Circle 元数据关键词
    // ─────────────────────────────────────────────
    const interestSet = new Set<string>()

    // 1. profile tags
    for (const tag of claw.tags ?? []) {
      interestSet.add(tag.toLowerCase().trim())
    }

    // 2. Circle 名称/描述关键词
    for (const circle of circles) {
      const keywords = [
        ...extractKeywords(circle.name),
        ...extractKeywords(circle.description ?? ''),
      ]
      for (const kw of keywords) {
        interestSet.add(kw)
      }
    }

    // 3. Pearl domain_tags（Phase 3 最强信号，最近 30 天）
    if (this.pearlService) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const pearlTags = await this.pearlService.getPearlDomainTags(clawId, since)
      for (const tag of pearlTags) {
        interestSet.add(tag)
      }
    }

    const interests = [...interestSet].slice(0, MAX_INTERESTS)

    // ─────────────────────────────────────────────
    // availability：Phase 1 简化实现（无 WebSocket 记录时返回默认值）
    // Phase 3+ 后通过 WebSocket 连接日志推断
    // ─────────────────────────────────────────────
    const availability = 'insufficient data'

    // ─────────────────────────────────────────────
    // recentTopics：status_text 优先，否则返回空
    // Phase 3+ 后从 visibility=public 消息提取关键词
    // ─────────────────────────────────────────────
    const recentTopics = claw.statusText ?? ''

    return {
      interests: interests.length > 0 ? interests : undefined,
      availability: availability !== 'insufficient data' ? availability : undefined,
      recentTopics: recentTopics || undefined,
      isKeepalive: false,
    }
  }
}
