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

/** Options for starting a session. `provider` selects mock vs. a real vendor (Claude). */
export const SessionStartSchema = z.object({
  provider: z.enum(['mock', 'claude']).default('mock'),
  model: z.string().optional()
})

export type SessionStartOptions = z.infer<typeof SessionStartSchema>

export const SessionStartResultSchema = z.object({
  ok: z.boolean(),
  provider: z.enum(['mock', 'claude'])
})

export type SessionStartResult = z.infer<typeof SessionStartResultSchema>

/** Whether an API key is set in the keychain ('set'), present via env ('env'), or absent. */
export const KeyStatusSchema = z.enum(['set', 'env', 'none'])

export type KeyStatus = z.infer<typeof KeyStatusSchema>
