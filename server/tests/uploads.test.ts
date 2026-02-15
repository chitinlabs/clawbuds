import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import { createApp } from '../src/app.js'
import { createTestDatabase } from '../src/db/database.js'

function signedHeaders(
  method: string,
  path: string,
  clawId: string,
  privateKey: string,
) {
  const timestamp = String(Date.now())
  const message = buildSignMessage(method, path, timestamp, '')
  const signature = sign(message, privateKey)
  return {
    'X-Claw-Id': clawId,
    'X-Claw-Timestamp': timestamp,
    'X-Claw-Signature': signature,
  }
}

interface TestClaw {
  clawId: string
  keys: ReturnType<typeof generateKeyPair>
}

async function registerClaw(
  app: ReturnType<typeof createApp>['app'],
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

describe('Uploads API', () => {
  let db: Database.Database
  let app: ReturnType<typeof createApp>['app']
  let tempDir: string

  beforeEach(() => {
    db = createTestDatabase()
    ;({ app } = createApp(db))
    tempDir = mkdtempSync(join(tmpdir(), 'clawbuds-upload-test-'))
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should upload a file', async () => {
    const alice = await registerClaw(app, 'Alice')

    const testFilePath = join(tempDir, 'test.txt')
    writeFileSync(testFilePath, 'hello world')

    const h = signedHeaders('POST', '/api/v1/uploads', alice.clawId, alice.keys.privateKey)
    const res = await request(app)
      .post('/api/v1/uploads')
      .set(h)
      .attach('file', testFilePath)

    expect(res.status).toBe(201)
    expect(res.body.data.filename).toBe('test.txt')
    expect(res.body.data.size).toBe(11)
    expect(res.body.data.id).toBeTruthy()
  })

  it('should download an uploaded file', async () => {
    const alice = await registerClaw(app, 'Alice')

    const testFilePath = join(tempDir, 'test.txt')
    writeFileSync(testFilePath, 'hello world')

    const h1 = signedHeaders('POST', '/api/v1/uploads', alice.clawId, alice.keys.privateKey)
    const uploadRes = await request(app)
      .post('/api/v1/uploads')
      .set(h1)
      .attach('file', testFilePath)

    const fileId = uploadRes.body.data.id

    const h2 = signedHeaders('GET', `/api/v1/uploads/${fileId}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/uploads/${fileId}`).set(h2)

    expect(res.status).toBe(200)
    expect(res.text).toBe('hello world')
  })

  it('should return 404 for nonexistent upload', async () => {
    const alice = await registerClaw(app, 'Alice')

    const fakeId = 'nonexistent-id'
    const h = signedHeaders('GET', `/api/v1/uploads/${fakeId}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/uploads/${fakeId}`).set(h)

    expect(res.status).toBe(404)
  })

  it('should reject upload with no file', async () => {
    const alice = await registerClaw(app, 'Alice')

    const h = signedHeaders('POST', '/api/v1/uploads', alice.clawId, alice.keys.privateKey)
    const res = await request(app).post('/api/v1/uploads').set(h)

    expect(res.status).toBe(400)
  })
})
