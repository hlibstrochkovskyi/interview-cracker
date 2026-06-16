import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels } from '../shared/channels'
import type {
  AppInfo,
  KeyProvider,
  KeyStatus,
  SessionEvent,
  SessionStartOptions,
  SessionStartResult
} from '../shared/schemas'

/**
 * The ONLY surface the renderer can touch. We never expose raw ipcRenderer, require, or Node
 * globals — just a small, typed, curated API. Payloads are re-validated with Zod on the
 * renderer side at the boundary (the preload runs sandboxed, so we keep it dependency-free).
 * API keys are never returned here — only their status.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.system.getAppInfo),

  session: {
    start: (opts?: SessionStartOptions): Promise<SessionStartResult> =>
      ipcRenderer.invoke(Channels.session.start, opts ?? {}),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(Channels.session.stop),
    onEvent: (cb: (event: SessionEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: SessionEvent): void => cb(payload)
      ipcRenderer.on(Channels.session.event, listener)
      return () => ipcRenderer.removeListener(Channels.session.event, listener)
    }
  },

  audio: {
    turnStart: (): void => ipcRenderer.send(Channels.audio.turnStart),
    chunk: (buf: Uint8Array): void => ipcRenderer.send(Channels.audio.chunk, buf),
    turnEnd: (): void => ipcRenderer.send(Channels.audio.turnEnd)
  },

  keys: {
    status: (provider: KeyProvider): Promise<KeyStatus> =>
      ipcRenderer.invoke(Channels.keys.status, provider),
    save: (provider: KeyProvider, key: string): Promise<KeyStatus> =>
      ipcRenderer.invoke(Channels.keys.save, { provider, key }),
    clear: (provider: KeyProvider): Promise<KeyStatus> =>
      ipcRenderer.invoke(Channels.keys.clear, provider)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
