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
  addProfile,
  getProfile,
  getCurrentProfileName,
  listProfiles,
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

    it('round-trips multi-profile config', () => {
      const cfg = {
        version: '2.0',
        defaultProfile: 'test',
        profiles: {
          test: {
            serverUrl: 'http://localhost:3000',
            clawId: 'claw_abcdef0123456789',
            publicKey: 'a'.repeat(64),
            displayName: 'Test',
          },
        },
      }
      saveConfig(cfg)
      expect(loadConfig()).toEqual(cfg)
    })

    it('migrates legacy config', async () => {
      // Write old format config
      const oldConfig = {
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_abcdef0123456789',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      }
      const fs = await import('node:fs')
      fs.writeFileSync(join(tmpDir, 'config.json'), JSON.stringify(oldConfig))

      // Load should migrate automatically
      const loaded = loadConfig()
      expect(loaded).toBeTruthy()
      expect(loaded?.version).toBe('2.0')
      expect(loaded?.defaultProfile).toBe('localhost-3000')
      expect(loaded?.profiles['localhost-3000']).toEqual(oldConfig)
    })
  })

  describe('private key', () => {
    it('returns null when not saved', () => {
      expect(loadPrivateKey('test')).toBeNull()
    })

    it('round-trips private key', () => {
      const key = 'b'.repeat(64)
      savePrivateKey('test', key)
      expect(loadPrivateKey('test')).toBe(key)
    })

    it('sets 0600 permissions', () => {
      savePrivateKey('test', 'c'.repeat(64))
      const stat = statSync(join(tmpDir, 'keys', 'test.key'))
      expect(stat.mode & 0o777).toBe(0o600)
    })

    it('supports multiple profiles', () => {
      savePrivateKey('profile1', 'a'.repeat(64))
      savePrivateKey('profile2', 'b'.repeat(64))
      expect(loadPrivateKey('profile1')).toBe('a'.repeat(64))
      expect(loadPrivateKey('profile2')).toBe('b'.repeat(64))
    })
  })

  describe('state.json', () => {
    it('returns empty object when not saved', () => {
      expect(loadState()).toEqual({})
    })

    it('round-trips state', () => {
      const state = {
        profile1: { lastSeq: 42, daemonPid: 1234 },
        profile2: { lastSeq: 10 },
      }
      saveState(state)
      expect(loadState()).toEqual(state)
    })

    it('atomic write via rename', () => {
      saveState({ profile1: { lastSeq: 1 } })
      saveState({ profile1: { lastSeq: 2 } })
      expect(loadState().profile1?.lastSeq).toBe(2)
      // tmp file should not linger
      expect(() => readFileSync(join(tmpDir, 'state.json.tmp'))).toThrow()
    })
  })

  describe('profile management', () => {
    it('addProfile creates profile', () => {
      addProfile('test', {
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_test123',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      })

      const profile = getProfile('test')
      expect(profile).toBeTruthy()
      expect(profile?.clawId).toBe('claw_test123')
    })

    it('first profile becomes default', () => {
      addProfile('first', {
        serverUrl: 'http://server1.com',
        clawId: 'claw_first',
        publicKey: 'a'.repeat(64),
        displayName: 'First',
      })

      expect(getCurrentProfileName()).toBe('first')
    })

    it('listProfiles shows all profiles', () => {
      addProfile('profile1', {
        serverUrl: 'http://server1.com',
        clawId: 'claw_1',
        publicKey: 'a'.repeat(64),
        displayName: 'Profile 1',
      })
      addProfile('profile2', {
        serverUrl: 'http://server2.com',
        clawId: 'claw_2',
        publicKey: 'b'.repeat(64),
        displayName: 'Profile 2',
      })

      const profiles = listProfiles()
      expect(profiles).toHaveLength(2)
      expect(profiles[0].name).toBe('profile1')
      expect(profiles[0].isDefault).toBe(true)
      expect(profiles[1].name).toBe('profile2')
      expect(profiles[1].isDefault).toBe(false)
    })
  })

  describe('isRegistered', () => {
    it('returns false when nothing saved', () => {
      expect(isRegistered()).toBe(false)
    })

    it('returns true when config + key exist', () => {
      addProfile('test', {
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_abcdef0123456789',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      })
      savePrivateKey('test', 'b'.repeat(64))
      expect(isRegistered()).toBe(true)
    })

    it('returns false if profile exists but no key', () => {
      addProfile('test', {
        serverUrl: 'http://localhost:3000',
        clawId: 'claw_test',
        publicKey: 'a'.repeat(64),
        displayName: 'Test',
      })
      expect(isRegistered()).toBe(false)
    })

    it('checks specific profile when name provided', () => {
      addProfile('profile1', {
        serverUrl: 'http://server1.com',
        clawId: 'claw_1',
        publicKey: 'a'.repeat(64),
        displayName: 'Profile 1',
      })
      savePrivateKey('profile1', 'key1'.repeat(16))

      addProfile('profile2', {
        serverUrl: 'http://server2.com',
        clawId: 'claw_2',
        publicKey: 'b'.repeat(64),
        displayName: 'Profile 2',
      })
      // No key for profile2

      expect(isRegistered('profile1')).toBe(true)
      expect(isRegistered('profile2')).toBe(false)
    })
  })
})
