import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels } from '../shared/channels'
import type { AppInfo, SessionEvent } from '../shared/schemas'

/**
 * The ONLY surface the renderer can touch. We never expose raw ipcRenderer, require, or Node
 * globals — just a small, typed, curated API. Payloads are re-validated with Zod on the
 * renderer side at the boundary (the preload runs sandboxed, so we keep it dependency-free).
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.system.getAppInfo),

  session: {
    start: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(Channels.session.start),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(Channels.session.stop),
    /** Subscribe to session events. Returns an unsubscribe function. */
    onEvent: (cb: (event: SessionEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: SessionEvent): void => cb(payload)
      ipcRenderer.on(Channels.session.event, listener)
      return () => ipcRenderer.removeListener(Channels.session.event, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
