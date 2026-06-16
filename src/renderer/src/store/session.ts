import { create } from 'zustand'
import {
  SessionEventSchema,
  type KeyProvider,
  type KeyStatus,
  type SessionEvent,
  type TurnLatencyDto
} from '@shared/schemas'
import { MODELS, DEFAULT_MODEL_ID, type ModelId } from '../lib/models'
import { startCapture, stopCapture, releaseMic } from '../audio/capture'

const loadModel = (): ModelId => {
  const saved = localStorage.getItem('model')
  return MODELS.find((m) => m.id === saved)?.id ?? DEFAULT_MODEL_ID
}

export interface TurnRecord {
  turn: number
  transcript: string
  assistantText: string
  ttfaMs?: number
  latency: TurnLatencyDto
}

interface SessionState {
  view: 'home' | 'session' | 'settings'
  mode: 'demo' | 'live'
  status: 'idle' | 'running' | 'done'
  llmKind: 'claude' | 'mock'
  sttKind: 'deepgram' | 'mock'
  model: ModelId
  keyStatus: Record<KeyProvider, KeyStatus>
  speaking: boolean
  listening: boolean
  currentTurn: number
  captions: string[]
  userTranscript: string
  turns: TurnRecord[]
  unsubscribe?: () => void

  refreshKeyStatus: () => Promise<void>
  saveKey: (provider: KeyProvider, key: string) => Promise<void>
  clearKey: (provider: KeyProvider) => Promise<void>
  setModel: (id: ModelId) => void
  openSettings: () => void
  closeSettings: () => void
  enter: (opts?: { demo?: boolean }) => Promise<void>
  leave: () => Promise<void>
  pushToTalkStart: () => Promise<void>
  pushToTalkEnd: () => Promise<void>
  apply: (event: SessionEvent) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  view: 'home',
  mode: 'demo',
  status: 'idle',
  llmKind: 'mock',
  sttKind: 'mock',
  model: loadModel(),
  keyStatus: { anthropic: 'none', deepgram: 'none' },
  speaking: false,
  listening: false,
  currentTurn: 0,
  captions: [],
  userTranscript: '',
  turns: [],

  refreshKeyStatus: async () => {
    const [anthropic, deepgram] = await Promise.all([
      window.api.keys.status('anthropic'),
      window.api.keys.status('deepgram')
    ])
    set({ keyStatus: { anthropic, deepgram } })
  },

  saveKey: async (provider, key) => {
    const status = await window.api.keys.save(provider, key)
    set((s) => ({ keyStatus: { ...s.keyStatus, [provider]: status } }))
  },

  clearKey: async (provider) => {
    const status = await window.api.keys.clear(provider)
    set((s) => ({ keyStatus: { ...s.keyStatus, [provider]: status } }))
  },

  setModel: (id) => {
    localStorage.setItem('model', id)
    set({ model: id })
  },
  openSettings: () => set({ view: 'settings' }),
  closeSettings: () => set({ view: 'home' }),

  enter: async (opts) => {
    get().unsubscribe?.()
    const unsubscribe = window.api.session.onEvent((raw) => {
      const parsed = SessionEventSchema.safeParse(raw)
      if (parsed.success) get().apply(parsed.data)
    })
    const mode = opts?.demo ? 'demo' : 'live'
    set({
      view: 'session',
      mode,
      status: 'running',
      speaking: false,
      listening: false,
      currentTurn: 0,
      captions: [],
      userTranscript: '',
      turns: [],
      unsubscribe
    })
    const result = await window.api.session.start({ mode, model: get().model })
    set({ llmKind: result.llm, sttKind: result.stt })
  },

  leave: async () => {
    await window.api.session.stop().catch(() => undefined)
    releaseMic()
    get().unsubscribe?.()
    set({ view: 'home', status: 'idle', speaking: false, listening: false, unsubscribe: undefined })
  },

  pushToTalkStart: async () => {
    if (get().mode !== 'live' || get().speaking || get().listening) return
    set({ listening: true })
    window.api.audio.turnStart()
    await startCapture((buf) => window.api.audio.chunk(buf))
  },

  pushToTalkEnd: async () => {
    if (!get().listening) return
    set({ listening: false })
    await stopCapture()
    window.api.audio.turnEnd()
  },

  apply: (event) => {
    switch (event.type) {
      case 'turnStart':
        set({ currentTurn: event.turn, captions: [] })
        break
      case 'listening':
        set({ listening: event.active })
        break
      case 'userFinal':
        set({ userTranscript: event.text })
        break
      case 'clause':
        set((s) => ({ captions: [...s.captions, event.text] }))
        break
      case 'speaking':
        set({ speaking: event.active })
        break
      case 'turnComplete':
        set((s) => ({
          turns: [
            ...s.turns,
            {
              turn: event.turn,
              transcript: event.transcript,
              assistantText: event.assistantText,
              ttfaMs: event.latency.timeToFirstAudioMs,
              latency: event.latency
            }
          ]
        }))
        break
      case 'sessionComplete':
        set({ status: 'done', speaking: false })
        break
    }
  }
}))
