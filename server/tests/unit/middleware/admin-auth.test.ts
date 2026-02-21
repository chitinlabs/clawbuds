/**
 * Admin Auth Middleware 单元测试（Phase 12c T12c-1）
 * 验证 CLAWBUDS_ADMIN_KEY 配置的 503 和 401 逻辑
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { createAdminAuthMiddleware } from '../../../src/middleware/admin-auth.js'

function makeMockRes() {
  const res = {
    status: function (code: number) { this._status = code; return this },
    json: function (body: unknown) { this._body = body; return this },
    _status: 200,
    _body: null as unknown,
  }
  return res
}

describe('createAdminAuthMiddleware', () => {
  let originalKey: string | undefined

  beforeEach(() => {
    originalKey = process.env['CLAWBUDS_ADMIN_KEY']
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env['CLAWBUDS_ADMIN_KEY']
    } else {
      process.env['CLAWBUDS_ADMIN_KEY'] = originalKey
    }
  })

  it('should call next when key is correct', () => {
    process.env['CLAWBUDS_ADMIN_KEY'] = 'secret-key'
    const middleware = createAdminAuthMiddleware()

    const req = { headers: { authorization: 'Bearer secret-key' } } as unknown as Request
    const res = makeMockRes() as unknown as Response
    let called = false
    const next: NextFunction = () => { called = true }

    middleware(req, res, next)
    expect(called).toBe(true)
  })

  it('should return 401 when key is wrong', () => {
    process.env['CLAWBUDS_ADMIN_KEY'] = 'correct-key'
    const middleware = createAdminAuthMiddleware()

    const req = { headers: { authorization: 'Bearer wrong-key' } } as unknown as Request
    const res = makeMockRes()
    const next: NextFunction = () => {}

    middleware(req, res as unknown as Response, next)
    expect(res._status).toBe(401)
  })

  it('should return 401 when authorization header is missing', () => {
    process.env['CLAWBUDS_ADMIN_KEY'] = 'some-key'
    const middleware = createAdminAuthMiddleware()

    const req = { headers: {} } as unknown as Request
    const res = makeMockRes()
    const next: NextFunction = () => {}

    middleware(req, res as unknown as Response, next)
    expect(res._status).toBe(401)
  })

  it('should return 503 when CLAWBUDS_ADMIN_KEY is not configured', () => {
    delete process.env['CLAWBUDS_ADMIN_KEY']
    const middleware = createAdminAuthMiddleware()

    const req = { headers: { authorization: 'Bearer anything' } } as unknown as Request
    const res = makeMockRes()
    const next: NextFunction = () => {}

    middleware(req, res as unknown as Response, next)
    expect(res._status).toBe(503)
  })

  it('should return 401 when Bearer prefix is missing', () => {
    process.env['CLAWBUDS_ADMIN_KEY'] = 'my-key'
    const middleware = createAdminAuthMiddleware()

    const req = { headers: { authorization: 'my-key' } } as unknown as Request
    const res = makeMockRes()
    const next: NextFunction = () => {}

    middleware(req, res as unknown as Response, next)
    expect(res._status).toBe(401)
  })
})
