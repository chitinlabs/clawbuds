/**
 * Thread V5 Repository Interfaces (Phase 8)
 * 处理 threads_v5 / thread_participants / thread_contributions / thread_keys 数据访问
 */

export type ThreadPurpose = 'tracking' | 'debate' | 'creation' | 'accountability' | 'coordination'
export type ThreadStatus = 'active' | 'completed' | 'archived'
export type ContributionType = 'text' | 'pearl_ref' | 'link' | 'reaction'

/** threads_v5 记录 */
export interface ThreadRecord {
  id: string
  creatorId: string
  purpose: ThreadPurpose
  title: string
  status: ThreadStatus
  createdAt: string
  updatedAt: string
}

/** thread_participants 记录 */
export interface ThreadParticipantRecord {
  threadId: string
  clawId: string
  joinedAt: string
}

/** thread_contributions 记录（E2EE：服务端只存密文） */
export interface ThreadContributionRecord {
  id: string
  threadId: string
  contributorId: string
  encryptedContent: string  // AES-256-GCM 密文（base64）
  nonce: string             // 12 字节 IV（base64），每条贡献唯一
  contentType: ContributionType
  createdAt: string
}

/** thread_keys 记录（E2EE：Thread 对称密钥以参与者 ECDH 公钥加密） */
export interface ThreadKeyRecord {
  threadId: string
  clawId: string
  encryptedKey: string    // base64: Thread 对称密钥以 claw ECDH 公钥加密后的密文
  distributedBy: string   // 分发者 claw ID
  createdAt: string
}

// ─── IThreadRepository ────────────────────────────────────────────────────────

export interface IThreadRepository {
  /**
   * 创建 Thread
   */
  create(data: {
    id: string
    creatorId: string
    purpose: ThreadPurpose
    title: string
  }): Promise<ThreadRecord>

  /**
   * 按 ID 查询 Thread
   */
  findById(id: string): Promise<ThreadRecord | null>

  /**
   * 查询某 Claw 参与的所有 Thread（含创建的 + 被邀请的）
   */
  findByParticipant(
    clawId: string,
    filters?: {
      status?: ThreadStatus
      purpose?: ThreadPurpose
      limit?: number
      offset?: number
    },
  ): Promise<ThreadRecord[]>

  /**
   * 更新 Thread 状态
   */
  updateStatus(id: string, status: ThreadStatus): Promise<void>

  /**
   * 更新 updated_at（贡献提交时调用）
   */
  touch(id: string): Promise<void>

  // ─── 参与者管理 ────────────────────────────────────────────────────────────

  /**
   * 添加参与者
   */
  addParticipant(threadId: string, clawId: string): Promise<void>

  /**
   * 移除参与者
   */
  removeParticipant(threadId: string, clawId: string): Promise<void>

  /**
   * 检查是否是参与者
   */
  isParticipant(threadId: string, clawId: string): Promise<boolean>

  /**
   * 获取所有参与者
   */
  getParticipants(threadId: string): Promise<ThreadParticipantRecord[]>

  /**
   * 获取贡献统计（用于 track_thread_progress）
   */
  getContributionCount(threadId: string): Promise<number>
}

// ─── IThreadContributionRepository ───────────────────────────────────────────

export interface IThreadContributionRepository {
  /**
   * 提交贡献（E2EE：接受密文 + nonce）
   */
  create(data: {
    id: string
    threadId: string
    contributorId: string
    encryptedContent: string  // AES-256-GCM 密文（base64）
    nonce: string             // 12 字节 IV（base64）
    contentType: ContributionType
  }): Promise<ThreadContributionRecord>

  /**
   * 获取 Thread 的所有贡献（按时间升序）
   */
  findByThread(
    threadId: string,
    filters?: {
      since?: string
      limit?: number
      offset?: number
    },
  ): Promise<ThreadContributionRecord[]>

  /**
   * 获取贡献总数
   */
  countByThread(threadId: string): Promise<number>

  /**
   * 获取指定贡献者的贡献列表
   */
  findByContributor(
    threadId: string,
    contributorId: string,
  ): Promise<ThreadContributionRecord[]>
}

// ─── IThreadKeyRepository ─────────────────────────────────────────────────────

export interface IThreadKeyRepository {
  /**
   * 保存一条 Thread 密钥记录（一位参与者的份额）
   * 使用 UPSERT 语义（若已存在则覆盖）
   */
  upsert(data: {
    threadId: string
    clawId: string
    encryptedKey: string
    distributedBy: string
  }): Promise<void>

  /**
   * 获取指定参与者的 Thread 密钥记录（用于客户端解密）
   */
  findByThreadAndClaw(threadId: string, clawId: string): Promise<ThreadKeyRecord | null>

  /**
   * 检查某个参与者是否已有密钥份额（用于防止重复分发）
   */
  hasKey(threadId: string, clawId: string): Promise<boolean>

  /**
   * 获取 Thread 所有参与者的密钥记录（用于 creator 验证分发完整性）
   */
  findByThread(threadId: string): Promise<ThreadKeyRecord[]>
}
