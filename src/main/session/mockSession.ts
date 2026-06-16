import type { WebContents } from 'electron'
import { Channels } from '../../shared/channels'
import type { SessionEvent } from '../../shared/schemas'
import type { ChatMessage, LlmAdapter } from '../../shared/adapters'
import { runTurn } from '../../orchestrator/pipeline'
import { MockSttAdapter, MockLlmAdapter, MockTtsAdapter } from '../../orchestrator/adapters/mock'
import { INTERVIEWER_SYSTEM } from './prompts'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface SessionOptions {
  /** When omitted, a deterministic mock LLM is used (no keys, no cost). */
  llm?: LlmAdapter
  model?: string
}

/**
 * Drives a multi-turn interview through the real pipeline and streams events to the renderer.
 * With the default mock LLM this is the clickable version of `npm run spike`; pass a real
 * adapter (Claude) and the very same loop produces a real session — the dashboard then shows
 * a true time-to-first-audio.
 */
export class MockSession {
  private cancelled = false
  private readonly llm: LlmAdapter
  private readonly model?: string

  constructor(
    private readonly wc: WebContents,
    opts: SessionOptions = {}
  ) {
    this.llm = opts.llm ?? new MockLlmAdapter()
    this.model = opts.model
  }

  stop(): void {
    this.cancelled = true
  }

  private send(event: SessionEvent): void {
    if (!this.wc.isDestroyed()) this.wc.send(Channels.session.event, event)
  }

  async run(turns = 6): Promise<void> {
    const history: ChatMessage[] = [{ role: 'system', content: INTERVIEWER_SYSTEM }]

    for (let turn = 1; turn <= turns && !this.cancelled; turn++) {
      this.send({ type: 'turnStart', turn })
      this.send({ type: 'speaking', turn, active: true })

      const result = await runTurn(history, [new Int16Array(320)], {
        stt: new MockSttAdapter(),
        llm: this.llm,
        tts: new MockTtsAdapter(),
        voiceId: 'mock-voice',
        model: this.model,
        onClause: (text) => this.send({ type: 'clause', turn, text })
      })

      if (this.cancelled) break

      history.push({ role: 'user', content: result.transcript })
      history.push({ role: 'assistant', content: result.assistantText })

      this.send({ type: 'speaking', turn, active: false })
      this.send({
        type: 'turnComplete',
        turn,
        transcript: result.transcript,
        assistantText: result.assistantText,
        latency: result.latency
      })

      await delay(1200) // a natural pause before the next question
    }

    this.send({ type: 'sessionComplete' })
  }
}
