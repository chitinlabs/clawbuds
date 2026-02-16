/**
 * Upload Repository Interface
 * 上传文件数据访问接口
 */

export interface UploadProfile {
  id: string
  ownerId: string
  filename: string
  mimeType: string
  size: number
  path: string
  createdAt: string
}

export interface CreateUploadDTO {
  id: string
  ownerId: string
  filename: string
  mimeType: string
  size: number
  path: string
}

export interface IUploadRepository {
  // ========== 创建 ==========
  /**
   * 创建上传记录
   */
  create(data: CreateUploadDTO): Promise<UploadProfile>

  // ========== 查询 ==========
  /**
   * 根据 ID 查询上传记录
   */
  findById(id: string): Promise<UploadProfile | null>

  /**
   * 查询用户的上传记录
   */
  findByOwner(ownerId: string, options?: { limit?: number; offset?: number }): Promise<UploadProfile[]>

  // ========== 删除 ==========
  /**
   * 删除上传记录
   */
  delete(id: string, ownerId: string): Promise<void>

  // ========== 统计 ==========
  /**
   * 检查上传记录是否存在
   */
  exists(id: string): Promise<boolean>

  /**
   * 统计用户的上传数量
   */
  countByOwner(ownerId: string): Promise<number>
}
