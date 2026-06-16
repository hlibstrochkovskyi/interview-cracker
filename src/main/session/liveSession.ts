import type { WebContents } from 'electron'
import { Channels } from '../../shared/channels'
import type { SessionEvent } from '../../shared/schemas'
import type { ChatMessage, LlmAdapter, SttAdapter, SttSession } from '../../shared/adapters'
import { ClauseChunker } from '../../orchestrator/chunker/clauseChunker'
import { LatencyTracker } from '../../orchestrator/metrics/latency'
import { INTERVIEWER_SYSTEM } from './prompts'

export interface LiveSessionDeps {
  llm: LlmAdapter
  stt: SttAdapter
  model?: string
}

/**
 * Interactive push-to-talk session. The interviewer opens with a question, then for each turn:
 * the renderer streams mic audio while the user holds to talk; on release we finalize STT, feed
 * the transcript to the LLM, and stream the next question back as clauses. Time-to-first-audio
 * is measured from release (until real TTS lands, "first audio" == "first clause").
 */
export class LiveSession {
  private cancelled = false
  private busy = false
  private turn = 0
  private readonly history: ChatMessage[] = [{ role: 'system', content: INTERVIEWER_SYSTEM }]
  private active?: SttSession

  constructor(
    private readonly wc: WebContents,
    private readonly deps: LiveSessionDeps
  ) {}

  private send(event: SessionEvent): void {
    if (!this.wc.isDestroyed()) this.wc.send(Channels.session.event, event)
  }

  stop(): void {
    this.cancelled = true
    this.active?.close()
    this.active = undefined
  }

  /** Opening question. */
  async begin(): Promise<void> {
    await this.assistantTurn(undefined)
  }

  turnStart(): void {
    if (this.busy || this.cancelled || this.active) return
    this.active = this.deps.stt.start({ sampleRate: 16_000 })
    this.send({ type: 'listening', active: true })
  }

  chunk(data: ArrayBufferView | ArrayBuffer): void {
    this.active?.pushAudio(data)
  }

  async turnEnd(): Promise<void> {
    if (!this.active) return
    this.send({ type: 'listening', active: false })
    const stt = this.active
    this.active = undefined

    const tracker = new LatencyTracker()
    tracker.mark('userStopped')
    const final = await stt.end()
    tracker.mark('sttFinal')

    const text = final.text || '(no speech detected)'
    this.send({ type: 'userFinal', turn: this.turn + 1, text })
    await this.assistantTurn(text, tracker)
  }

  private async assistantTurn(
    userText: string | undefined,
    tracker?: LatencyTracker
  ): Promise<void> {
    if (this.cancelled) return
    this.busy = true
    this.turn += 1
    const turn = this.turn
    const t = tracker ?? new LatencyTracker()
    if (!tracker) t.mark('userStopped')

    if (userText !== undefined) this.history.push({ role: 'user', content: userText })

    // For the opening turn there is no user input yet — seed a kickoff so the model leads.
    const messages: ChatMessage[] =
      userText === undefined
        ? [
            ...this.history,
            {
              role: 'user',
              content: 'Begin the interview: greet me briefly and ask your first question.'
            }
          ]
        : this.history

    this.send({ type: 'speaking', turn, active: true })

    const chunker = new ClauseChunker()
    let assistant = ''
    let sawToken = false
    let sawClause = false

    const emit = (clause: string): void => {
      if (!sawClause) {
        t.mark('firstClause')
        t.mark('firstAudio')
        sawClause = true
      }
      this.send({ type: 'clause', turn, text: clause })
    }

    for await (const token of this.deps.llm.stream(messages, { model: this.deps.model })) {
      if (this.cancelled) break
      if (!sawToken) {
        t.mark('llmFirstToken')
        sawToken = true
      }
      assistant += token
      for (const clause of chunker.push(token)) emit(clause)
    }
    const tail = chunker.flush()
    if (tail) emit(tail)

    this.history.push({ role: 'assistant', content: assistant })
    this.send({ type: 'speaking', turn, active: false })
    this.send({
      type: 'turnComplete',
      turn,
      transcript: userText ?? '',
      assistantText: assistant,
      latency: t.report()
    })
    this.busy = false
  }
}
