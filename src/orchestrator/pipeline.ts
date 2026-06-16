/**
 * The voice loop for a single turn — the heart of the spike.
 *
 *   user audio → STT → LLM (streaming) → clause chunker → TTS (streaming) → audio out
 *
 * The key latency move: we do NOT wait for the full LLM response. As soon as the chunker
 * yields the first complete clause we start TTS on it, while the LLM keeps streaming the rest.
 * Every stage is timed so time-to-first-audio is measured, not guessed.
 */
import { ClauseChunker } from './chunker/clauseChunker'
import { LatencyTracker, type TurnLatency } from './metrics/latency'
import type {
  AudioFrame,
  ChatMessage,
  LlmAdapter,
  SttAdapter,
  TtsAdapter
} from '../shared/adapters'

export interface VoicePipelineDeps {
  stt: SttAdapter
  llm: LlmAdapter
  tts: TtsAdapter
  voiceId: string
  model?: string
  minClauseLength?: number
  sampleRate?: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
  /** Streamed out as audio is produced (the renderer plays these). */
  onAudioFrame?: (frame: AudioFrame) => void
  /** Fired as each speakable clause is dispatched to TTS (handy for captions/logging). */
  onClause?: (clause: string) => void
}

export interface TurnResult {
  transcript: string
  assistantText: string
  audioFrames: AudioFrame[]
  latency: TurnLatency
}

export async function runTurn(
  history: ChatMessage[],
  userAudio: Int16Array[],
  deps: VoicePipelineDeps
): Promise<TurnResult> {
  const tracker = new LatencyTracker(deps.now)
  tracker.mark('userStopped')

  // 1. Speech-to-text.
  const session = deps.stt.start({ sampleRate: deps.sampleRate ?? 16_000 })
  for (const frame of userAudio) session.pushAudio(frame)
  const stt = await session.end()
  session.close()
  tracker.mark('sttFinal')

  // 2. LLM stream → clause chunker → early TTS.
  const messages: ChatMessage[] = [...history, { role: 'user', content: stt.text }]
  const chunker = new ClauseChunker({ minLength: deps.minClauseLength })
  const frames: AudioFrame[] = []
  let assistantText = ''
  let sawToken = false
  let sawClause = false
  let sawAudio = false

  const speak = async (clause: string): Promise<void> => {
    if (!sawClause) {
      tracker.mark('firstClause')
      sawClause = true
    }
    deps.onClause?.(clause)
    for await (const frame of deps.tts.synthesize(clause, deps.voiceId)) {
      if (!sawAudio) {
        tracker.mark('firstAudio')
        sawAudio = true
      }
      frames.push(frame)
      deps.onAudioFrame?.(frame)
    }
  }

  for await (const token of deps.llm.stream(messages, { model: deps.model })) {
    if (!sawToken) {
      tracker.mark('llmFirstToken')
      sawToken = true
    }
    assistantText += token
    for (const clause of chunker.push(token)) await speak(clause)
  }

  const tail = chunker.flush()
  if (tail) await speak(tail)

  return { transcript: stt.text, assistantText, audioFrames: frames, latency: tracker.report() }
}
