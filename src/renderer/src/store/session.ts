import { create } from 'zustand'
import { SessionEventSchema, type SessionEvent, type TurnLatencyDto } from '@shared/schemas'

export interface TurnRecord {
  turn: number
  transcript: string
  assistantText: string
  ttfaMs?: number
  latency: TurnLatencyDto
}

interface SessionState {
  view: 'home' | 'session'
  status: 'idle' | 'running' | 'done'
  speaking: boolean
  currentTurn: number
  captions: string[]
  turns: TurnRecord[]
  unsubscribe?: () => void

  enter: () => Promise<void>
  leave: () => Promise<void>
  apply: (event: SessionEvent) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  view: 'home',
  status: 'idle',
  speaking: false,
  currentTurn: 0,
  captions: [],
  turns: [],

  enter: async () => {
    get().unsubscribe?.()
    const unsubscribe = window.api.session.onEvent((raw) => {
      const parsed = SessionEventSchema.safeParse(raw)
      if (parsed.success) get().apply(parsed.data)
    })
    set({
      view: 'session',
      status: 'running',
      speaking: false,
      currentTurn: 0,
      captions: [],
      turns: [],
      unsubscribe
    })
    await window.api.session.start()
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
