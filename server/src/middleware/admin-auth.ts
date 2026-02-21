/**
 * Admin Auth Middleware（Phase 12c）
 * 验证 Authorization: Bearer <CLAWBUDS_ADMIN_KEY> header
 *
 * - CLAWBUDS_ADMIN_KEY 未配置 → 503 Service Unavailable
 * - Bearer token 不匹配 → 401 Unauthorized
 * - 匹配 → next()
 */

import type { Request, Response, NextFunction } from 'express'

export function createAdminAuthMiddleware() {
  return function adminAuth(req: Request, res: Response, next: NextFunction): void {
    const configuredKey = process.env['CLAWBUDS_ADMIN_KEY']

    if (!configuredKey) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Admin key not configured' } })
      return
    }

    const authHeader = req.headers['authorization']
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

    if (!token || token !== configuredKey) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid admin key' } })
      return
    }

    next()
  }
}
