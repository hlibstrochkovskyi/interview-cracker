import { create } from 'zustand'
import {
  SessionEventSchema,
  type KeyStatus,
  type SessionEvent,
  type TurnLatencyDto
} from '@shared/schemas'
import { MODELS, DEFAULT_MODEL_ID, type ModelId } from '../lib/models'

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
  status: 'idle' | 'running' | 'done'
  provider: 'mock' | 'claude'
  model: ModelId
  keyStatus: KeyStatus
  speaking: boolean
  currentTurn: number
  captions: string[]
  turns: TurnRecord[]
  unsubscribe?: () => void

  refreshKeyStatus: () => Promise<void>
  saveKey: (key: string) => Promise<void>
  clearKey: () => Promise<void>
  setModel: (id: ModelId) => void
  openSettings: () => void
  closeSettings: () => void
  enter: (opts?: { forceMock?: boolean }) => Promise<void>
  leave: () => Promise<void>
  apply: (event: SessionEvent) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  view: 'home',
  status: 'idle',
  provider: 'mock',
  model: loadModel(),
  keyStatus: 'none',
  speaking: false,
  currentTurn: 0,
  captions: [],
  turns: [],

  refreshKeyStatus: async () => set({ keyStatus: await window.api.keys.status() }),

  saveKey: async (key) => set({ keyStatus: await window.api.keys.save(key) }),
  clearKey: async () => set({ keyStatus: await window.api.keys.clear() }),
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
    const wantClaude = !opts?.forceMock && get().keyStatus !== 'none'
    set({
      view: 'session',
      status: 'running',
      speaking: false,
      currentTurn: 0,
      captions: [],
      turns: [],
      unsubscribe
    })
    const result = await window.api.session.start({
      provider: wantClaude ? 'claude' : 'mock',
      model: get().model
    })
    set({ provider: result.provider })
  },

  leave: async () => {
    await window.api.session.stop().catch(() => undefined)
    get().unsubscribe?.()
    set({ view: 'home', status: 'idle', speaking: false, unsubscribe: undefined })
  },

  apply: (event) => {
    switch (event.type) {
      case 'turnStart':
        set({ currentTurn: event.turn, captions: [] })
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
