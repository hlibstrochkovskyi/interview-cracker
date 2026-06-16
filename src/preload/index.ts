import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/channels'
import type { AppInfo } from '../shared/schemas'

/**
 * The ONLY surface the renderer can touch. We never expose raw ipcRenderer, require, or Node
 * globals — just a small, typed, curated API. Every channel added here gets a Zod-validated
 * handler on the main side.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.system.getAppInfo)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
