/**
 * Base Repository Interface
 * 所有 Repository 的基础接口，定义通用的 CRUD 操作
 */

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>
}

export interface FilterOptions {
  [key: string]: any
}

/**
 * 基础 Repository 接口
 * @template T - 实体类型
 * @template CreateDTO - 创建 DTO 类型
 * @template UpdateDTO - 更新 DTO 类型
 */
export interface IBaseRepository<T, CreateDTO, UpdateDTO> {
  // ========== 创建 ==========
  /**
   * 创建单个实体
   */
  create(data: CreateDTO): Promise<T>

  /**
   * 批量创建实体
   */
  createMany(data: CreateDTO[]): Promise<T[]>

  // ========== 查询 ==========
  /**
   * 根据 ID 查询实体
   */
  findById(id: string): Promise<T | null>

  /**
   * 批量查询实体
   */
  findMany(ids: string[]): Promise<T[]>

  /**
   * 查询所有实体
   */
  findAll(options?: QueryOptions): Promise<T[]>

  // ========== 更新 ==========
  /**
   * 更新单个实体
   */
  update(id: string, data: UpdateDTO): Promise<T | null>

  /**
   * 批量更新实体
   */
  updateMany(updates: Array<{ id: string; data: UpdateDTO }>): Promise<T[]>

  // ========== 删除 ==========
  /**
   * 删除单个实体
   */
  delete(id: string): Promise<void>

  /**
   * 批量删除实体
   */
  deleteMany(ids: string[]): Promise<void>

  // ========== 统计 ==========
  /**
   * 统计实体数量
   */
  count(filters?: FilterOptions): Promise<number>

  /**
   * 检查实体是否存在
   */
  exists(id: string): Promise<boolean>
}
