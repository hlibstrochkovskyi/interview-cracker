import { z } from 'zod'

/**
 * Every IPC payload is validated against a Zod schema at the boundary. This grows one channel
 * at a time as milestones land.
 */
export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  electron: z.string(),
  node: z.string()
})

export type AppInfo = z.infer<typeof AppInfoSchema>

export const LatencyMarksSchema = z.object({
  userStopped: z.number().optional(),
  sttFinal: z.number().optional(),
  llmFirstToken: z.number().optional(),
  firstClause: z.number().optional(),
  firstAudio: z.number().optional()
})

export const TurnLatencySchema = z.object({
  marks: LatencyMarksSchema,
  timeToFirstAudioMs: z.number().optional()
})

export type TurnLatencyDto = z.infer<typeof TurnLatencySchema>

/** Streamed from the orchestrator (main) to the renderer over Channels.session.event. */
export const SessionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turnStart'), turn: z.number() }),
  z.object({ type: z.literal('listening'), active: z.boolean() }),
  z.object({ type: z.literal('userPartial'), text: z.string() }),
  z.object({ type: z.literal('userFinal'), turn: z.number(), text: z.string() }),
  z.object({ type: z.literal('clause'), turn: z.number(), text: z.string() }),
  z.object({ type: z.literal('speaking'), turn: z.number(), active: z.boolean() }),
  z.object({
    type: z.literal('turnComplete'),
    turn: z.number(),
    transcript: z.string(),
    assistantText: z.string(),
    latency: TurnLatencySchema
  }),
  z.object({ type: z.literal('sessionComplete') })
])

export type SessionEvent = z.infer<typeof SessionEventSchema>

/** Options for starting a session. `demo` auto-runs (mock); `live` is interactive push-to-talk. */
export const SessionStartSchema = z.object({
  mode: z.enum(['demo', 'live']).default('demo'),
  model: z.string().optional()
})

export type SessionStartOptions = z.infer<typeof SessionStartSchema>

export const SessionStartResultSchema = z.object({
  mode: z.enum(['demo', 'live']),
  llm: z.enum(['claude', 'mock']),
  stt: z.enum(['deepgram', 'mock'])
})

export type SessionStartResult = z.infer<typeof SessionStartResultSchema>

/** Which vendor a key belongs to. */
export const KeyProviderSchema = z.enum(['anthropic', 'deepgram'])

export type KeyProvider = z.infer<typeof KeyProviderSchema>

/** Whether an API key is set in the keychain ('set'), present via env ('env'), or absent. */
export const KeyStatusSchema = z.enum(['set', 'env', 'none'])

export type KeyStatus = z.infer<typeof KeyStatusSchema>

export const KeySaveSchema = z.object({ provider: KeyProviderSchema, key: z.string() })
