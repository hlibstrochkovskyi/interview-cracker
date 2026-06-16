/**
 * Mock provider adapters with configurable, realistic-shaped delays. These let the entire
 * voice pipeline run end-to-end with **no API keys and no cost** — for tests, for demo mode,
 * and for the spike. Real adapters (Deepgram/Claude/Cartesia/…) implement the same interfaces
 * and drop in behind them later.
 */
import type {
  AudioFrame,
  ChatMessage,
  LlmAdapter,
  SttAdapter,
  SttResult,
  SttSession,
  TtsAdapter
} from '../../shared/adapters'

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

export interface MockSttOptions {
  transcript?: string
  finalizeDelayMs?: number
}

export class MockSttAdapter implements SttAdapter {
  constructor(private readonly opts: MockSttOptions = {}) {}

  start(): SttSession {
    const transcript = this.opts.transcript ?? 'I led a database migration at my last job.'
    const delay = this.opts.finalizeDelayMs ?? 150
    return {
      pushAudio() {},
      async end(): Promise<SttResult> {
        await sleep(delay)
        return { text: transcript, isFinal: true }
      },
      async *results(): AsyncIterable<SttResult> {
        yield { text: transcript, isFinal: true }
      },
      close() {}
    }
  }
}

export interface MockLlmOptions {
  reply?: string
  firstTokenDelayMs?: number
  perTokenDelayMs?: number
}

export class MockLlmAdapter implements LlmAdapter {
  constructor(private readonly opts: MockLlmOptions = {}) {}

  async *stream(_messages: ChatMessage[]): AsyncIterable<string> {
    const reply =
      this.opts.reply ??
      "Thanks for sharing that. Let's dig into the migration you mentioned. " +
        'What was the hardest tradeoff, and how did you decide?'
    const firstTokenDelay = this.opts.firstTokenDelayMs ?? 400
    const perToken = this.opts.perTokenDelayMs ?? 20
    const tokens = reply.match(/\S+\s*/g) ?? [reply]

    await sleep(firstTokenDelay)
    for (let i = 0; i < tokens.length; i++) {
      if (i > 0) await sleep(perToken)
      yield tokens[i]
    }
  }

  async json<T>(): Promise<T> {
    throw new Error('MockLlmAdapter.json is not implemented yet (added with the feedback engine)')
  }
}

export interface MockTtsOptions {
  ttfbMs?: number
  frameMs?: number
  sampleRate?: number
  charsPerFrame?: number
}

export class MockTtsAdapter implements TtsAdapter {
  constructor(private readonly opts: MockTtsOptions = {}) {}

  async *synthesize(textChunk: string): AsyncIterable<AudioFrame> {
    const ttfb = this.opts.ttfbMs ?? 200
    const frameMs = this.opts.frameMs ?? 20
    const sampleRate = this.opts.sampleRate ?? 16_000
    const charsPerFrame = this.opts.charsPerFrame ?? 24
    const samplesPerFrame = Math.round((sampleRate * frameMs) / 1000)
    const frameCount = Math.max(1, Math.ceil(textChunk.trim().length / charsPerFrame))

    await sleep(ttfb)
    for (let i = 0; i < frameCount; i++) {
      if (i > 0) await sleep(frameMs)
      // Silent PCM16 — the spike measures the plumbing, not audio fidelity.
      yield { pcm: new Int16Array(samplesPerFrame), sampleRate }
    }
  }
}
