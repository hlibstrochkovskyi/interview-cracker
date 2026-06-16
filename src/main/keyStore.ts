import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { KeyProvider, KeyStatus } from '../shared/schemas'

/**
 * Bring-your-own-key storage, per vendor. Each key is encrypted at rest with the OS keychain
 * (Electron safeStorage), never written in plaintext, never returned to the renderer, and never
 * logged. A per-provider env var is honored as a dev convenience.
 */
const ENV_VAR: Record<KeyProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  deepgram: 'DEEPGRAM_API_KEY'
}

const cache: Partial<Record<KeyProvider, string | null>> = {}

const keyFile = (provider: KeyProvider): string =>
  join(app.getPath('userData'), `${provider}.key.enc`)

export function getApiKey(provider: KeyProvider): string | null {
  if (cache[provider]) return cache[provider] ?? null
  try {
    if (existsSync(keyFile(provider)) && safeStorage.isEncryptionAvailable()) {
      cache[provider] = safeStorage.decryptString(readFileSync(keyFile(provider)))
      return cache[provider] ?? null
    }
  } catch {
    // Corrupt or undecryptable — fall through to env / none.
  }
  return process.env[ENV_VAR[provider]]?.trim() || null
}

export function keyStatus(provider: KeyProvider): KeyStatus {
  if (cache[provider] || (existsSync(keyFile(provider)) && safeStorage.isEncryptionAvailable())) {
    return 'set'
  }
  if (process.env[ENV_VAR[provider]]?.trim()) return 'env'
  return 'none'
}

export function saveApiKey(provider: KeyProvider, key: string): KeyStatus {
  cache[provider] = key.trim() || null
  if (cache[provider] && safeStorage.isEncryptionAvailable()) {
    writeFileSync(keyFile(provider), safeStorage.encryptString(cache[provider] as string), {
      mode: 0o600
    })
  }
  return keyStatus(provider)
}

export function clearApiKey(provider: KeyProvider): KeyStatus {
  cache[provider] = null
  try {
    if (existsSync(keyFile(provider))) rmSync(keyFile(provider))
  } catch {
    // ignore
  }
  return keyStatus(provider)
}
