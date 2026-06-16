import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { Channels } from '../shared/channels'
import {
  AppInfoSchema,
  KeyProviderSchema,
  KeySaveSchema,
  SessionStartSchema
} from '../shared/schemas'
import type { LlmAdapter, SttAdapter } from '../shared/adapters'
import { MockSession } from './session/mockSession'
import { LiveSession } from './session/liveSession'
import { AnthropicLlmAdapter } from '../orchestrator/adapters/anthropic'
import { MockLlmAdapter, MockSttAdapter } from '../orchestrator/adapters/mock'
import { DeepgramSttAdapter } from '../orchestrator/adapters/deepgram'
import { getApiKey, keyStatus, saveApiKey, clearApiKey } from './keyStore'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    backgroundColor: '#f7f6f3',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Allow the mic (used for the live input meter / future STT); deny everything else.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  // External links open in the OS browser, never inside a privileged window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(Channels.system.getAppInfo, () =>
    AppInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      node: process.versions.node
    })
  )

  let mockSession: MockSession | null = null
  let liveSession: LiveSession | null = null

  const stopAll = (): void => {
    mockSession?.stop()
    mockSession = null
    liveSession?.stop()
    liveSession = null
  }

  ipcMain.handle(Channels.session.start, (event, raw) => {
    const opts = SessionStartSchema.parse(raw ?? {})
    stopAll()

    if (opts.mode === 'live') {
      const anthropicKey = getApiKey('anthropic')
      const deepgramKey = getApiKey('deepgram')
      const llm: LlmAdapter = anthropicKey
        ? new AnthropicLlmAdapter({ apiKey: anthropicKey, model: opts.model })
        : new MockLlmAdapter()
      const stt: SttAdapter = deepgramKey
        ? new DeepgramSttAdapter({ apiKey: deepgramKey })
        : new MockSttAdapter()

      liveSession = new LiveSession(event.sender, { llm, stt, model: opts.model })
      void liveSession.begin()
      return {
        mode: 'live',
        llm: anthropicKey ? 'claude' : 'mock',
        stt: deepgramKey ? 'deepgram' : 'mock'
      }
    }

    // Demo mode is the free, no-key, no-mic auto-run.
    mockSession = new MockSession(event.sender)
    void mockSession.run()
    return { mode: 'demo', llm: 'mock', stt: 'mock' }
  })

  ipcMain.handle(Channels.session.stop, () => {
    stopAll()
    return { ok: true }
  })

  // Push-to-talk audio uplink for the live session.
  ipcMain.on(Channels.audio.turnStart, () => liveSession?.turnStart())
  ipcMain.on(Channels.audio.chunk, (_event, chunk: ArrayBufferView | ArrayBuffer) =>
    liveSession?.chunk(chunk)
  )
  ipcMain.on(Channels.audio.turnEnd, () => void liveSession?.turnEnd())

  // BYO-key management. The key itself is never returned to the renderer.
  ipcMain.handle(Channels.keys.status, (_event, raw) => keyStatus(KeyProviderSchema.parse(raw)))
  ipcMain.handle(Channels.keys.save, (_event, raw) => {
    const { provider, key } = KeySaveSchema.parse(raw)
    return saveApiKey(provider, key)
  })
  ipcMain.handle(Channels.keys.clear, (_event, raw) => clearApiKey(KeyProviderSchema.parse(raw)))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
