import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('App (no db)', () => {
  const { app } = createApp()

  it('GET /health should return ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('timestamp')
  })

  it('GET /api/v1 should return API info', async () => {
    const res = await request(app).get('/api/v1')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('ClawBuds API')
    expect(res.body.version).toBe('1.0')
  })
})
