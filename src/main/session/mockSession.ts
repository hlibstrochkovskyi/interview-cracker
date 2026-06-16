import type { WebContents } from 'electron'
import { Channels } from '../../shared/channels'
import type { SessionEvent } from '../../shared/schemas'
import type { ChatMessage } from '../../shared/adapters'
import { runTurn } from '../../orchestrator/pipeline'
import { MockSttAdapter, MockLlmAdapter, MockTtsAdapter } from '../../orchestrator/adapters/mock'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Drives a multi-turn mock interview through the real pipeline and streams events to the
 * renderer. No keys, no cost — this is the clickable version of `npm run spike`. Swapping the
 * mock adapters for real ones turns this into a real session with zero changes here.
 */
export class MockSession {
  private cancelled = false

  constructor(private readonly wc: WebContents) {}

  stop(): void {
    this.cancelled = true
  }

  private send(event: SessionEvent): void {
    if (!this.wc.isDestroyed()) this.wc.send(Channels.session.event, event)
  }

  async run(turns = 6): Promise<void> {
    const history: ChatMessage[] = []

    for (let turn = 1; turn <= turns && !this.cancelled; turn++) {
      this.send({ type: 'turnStart', turn })
      this.send({ type: 'speaking', turn, active: true })

      const result = await runTurn(history, [new Int16Array(320)], {
        stt: new MockSttAdapter(),
        llm: new MockLlmAdapter(),
        tts: new MockTtsAdapter(),
        voiceId: 'mock-voice',
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
