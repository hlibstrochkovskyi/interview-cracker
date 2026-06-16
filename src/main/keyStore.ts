import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Bring-your-own-key storage. The Anthropic key is encrypted at rest with the OS keychain
 * (Electron safeStorage) and never written in plaintext, never returned to the renderer, and
 * never logged. An ANTHROPIC_API_KEY env var is honored as a dev convenience.
 */
export type KeyStatus = 'set' | 'env' | 'none'

let cached: string | null = null

const keyFile = (): string => join(app.getPath('userData'), 'anthropic.key.enc')

export function getApiKey(): string | null {
  if (cached) return cached
  try {
    if (existsSync(keyFile()) && safeStorage.isEncryptionAvailable()) {
      cached = safeStorage.decryptString(readFileSync(keyFile()))
      return cached
    }
  } catch {
    // Corrupt or undecryptable — fall through to env / none.
  }
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

export function keyStatus(): KeyStatus {
  if (cached || (existsSync(keyFile()) && safeStorage.isEncryptionAvailable())) return 'set'
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'env'
  return 'none'
}

export function saveApiKey(key: string): KeyStatus {
  cached = key.trim() || null
  if (cached && safeStorage.isEncryptionAvailable()) {
    writeFileSync(keyFile(), safeStorage.encryptString(cached), { mode: 0o600 })
  }
  return keyStatus()
}

export function clearApiKey(): KeyStatus {
  cached = null
  try {
    if (existsSync(keyFile())) rmSync(keyFile())
  } catch {
    // ignore
  }
  return keyStatus()
}
