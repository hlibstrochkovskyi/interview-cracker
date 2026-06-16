import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { z } from 'zod'
import { Channels } from '../shared/channels'
import { AppInfoSchema, SessionStartSchema } from '../shared/schemas'
import type { LlmAdapter } from '../shared/adapters'
import { MockSession } from './session/mockSession'
import { AnthropicLlmAdapter } from '../orchestrator/adapters/anthropic'
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

  let session: MockSession | null = null

  ipcMain.handle(Channels.session.start, (event, raw) => {
    const opts = SessionStartSchema.parse(raw ?? {})
    session?.stop()

    let llm: LlmAdapter | undefined
    let provider: 'mock' | 'claude' = 'mock'
    if (opts.provider === 'claude') {
      const apiKey = getApiKey()
      if (apiKey) {
        llm = new AnthropicLlmAdapter({ apiKey, model: opts.model })
        provider = 'claude'
      }
    }

    session = new MockSession(event.sender, { llm, model: opts.model })
    void session.run()
    return { ok: true, provider }
  })

  ipcMain.handle(Channels.session.stop, () => {
    session?.stop()
    session = null
    return { ok: true }
  })

  // BYO-key management. The key itself is never returned to the renderer.
  ipcMain.handle(Channels.keys.status, () => keyStatus())
  ipcMain.handle(Channels.keys.save, (_event, raw) => saveApiKey(z.string().parse(raw)))
  ipcMain.handle(Channels.keys.clear, () => clearApiKey())
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
