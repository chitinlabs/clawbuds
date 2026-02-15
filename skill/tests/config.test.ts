import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadConfig,
  saveConfig,
  loadPrivateKey,
  savePrivateKey,
  loadState,
  saveState,
  isRegistered,
} from '../src/config.js'

describe('config', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'clawbuds-test-'))
    process.env.CLAWBUDS_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.CLAWBUDS_CONFIG_DIR
  })

  describe('config.json', () => {
    it('returns null when not saved', () => {
      expect(loadConfig()).toBeNull()
    })

    it('round-trips config', () => {
      const cfg = {
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_abcdef0123456789',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      }
      saveConfig(cfg)
      expect(loadConfig()).toEqual(cfg)
    })
  })

  describe('private.key', () => {
    it('returns null when not saved', () => {
      expect(loadPrivateKey()).toBeNull()
    })

    it('round-trips private key', () => {
      const key = 'b'.repeat(64)
      savePrivateKey(key)
      expect(loadPrivateKey()).toBe(key)
    })

    it('sets 0600 permissions', () => {
      savePrivateKey('c'.repeat(64))
      const stat = statSync(join(tmpDir, 'private.key'))
      expect(stat.mode & 0o777).toBe(0o600)
    })
  })

  describe('state.json', () => {
    it('returns defaults when not saved', () => {
      expect(loadState()).toEqual({ lastSeq: 0 })
    })

    it('round-trips state', () => {
      const state = { lastSeq: 42, daemonPid: 1234 }
      saveState(state)
      expect(loadState()).toEqual(state)
    })

    it('atomic write via rename', () => {
      saveState({ lastSeq: 1 })
      saveState({ lastSeq: 2 })
      expect(loadState().lastSeq).toBe(2)
      // tmp file should not linger
      expect(() => readFileSync(join(tmpDir, 'state.json.tmp'))).toThrow()
    })
  })

  describe('isRegistered', () => {
    it('returns false when nothing saved', () => {
      expect(isRegistered()).toBe(false)
    })

    it('returns true when config + key exist', () => {
      saveConfig({
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_abcdef0123456789',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      })
      savePrivateKey('b'.repeat(64))
      expect(isRegistered()).toBe(true)
    })
  })
})
