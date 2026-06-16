/**
 * Provider adapter interfaces. Every external AI service sits behind one of these so it is
 * swappable and mockable. Each interface gets three concrete implementations:
 *   - `real`   — talks to the vendor (lives in the main/orchestrator process only)
 *   - `mock`   — deterministic, for unit tests
 *   - `replay` — plays recorded fixtures; powers demo mode (no keys, no cost)
 *
 * Adapters never import Electron — they are pure Node so they unit-test trivially.
 */

export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

export interface SttResult {
  text: string
  isFinal: boolean
  words?: WordTiming[]
}

export interface SttSession {
  /** Push a chunk of audio (PCM16 frames, or container bytes like webm/opus). */
  pushAudio(chunk: ArrayBufferView | ArrayBuffer): void
  /** Signal the user's turn has ended; resolves with the final transcript. */
  end(): Promise<SttResult>
  /** Streamed partial + final results. */
  results(): AsyncIterable<SttResult>
  close(): void
}

export interface SttAdapter {
  start(opts: { sampleRate: number; language?: string }): SttSession
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmAdapter {
  /** Stream a completion as text tokens (feeds the clause chunker → TTS). */
  stream(messages: ChatMessage[], opts?: { model?: string }): AsyncIterable<string>
  /** Structured output for the feedback engine; validated by the caller against a schema. */
  json<T>(messages: ChatMessage[], opts?: { model?: string }): Promise<T>
}

export interface AudioFrame {
  /** PCM16 mono samples at the negotiated sample rate. */
  pcm: Int16Array
  sampleRate: number
}

export interface TtsAdapter {
  synthesize(textChunk: string, voiceId: string): AsyncIterable<AudioFrame>
}
