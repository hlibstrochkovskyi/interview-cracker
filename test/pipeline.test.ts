import { describe, it, expect } from 'vitest'
import { runTurn } from '@orchestrator/pipeline'
import { MockSttAdapter, MockLlmAdapter, MockTtsAdapter } from '@orchestrator/adapters/mock'

function counter(): () => number {
  let n = -1
  return () => ++n
}

function deps(overrides = {}) {
  return {
    stt: new MockSttAdapter({ transcript: 'hello there', finalizeDelayMs: 0 }),
    llm: new MockLlmAdapter({
      reply: 'That is a great point. Tell me more about the rollback.',
      firstTokenDelayMs: 0,
      perTokenDelayMs: 0
    }),
    tts: new MockTtsAdapter({ ttfbMs: 0, frameMs: 0 }),
    voiceId: 'mock',
    minClauseLength: 8,
    now: counter(),
    ...overrides
  }
}

describe('runTurn (voice pipeline)', () => {
  it('produces the transcript, the assistant reply, and audio frames', async () => {
    const result = await runTurn([], [new Int16Array(320)], deps())
    expect(result.transcript).toBe('hello there')
    expect(result.assistantText).toBe('That is a great point. Tell me more about the rollback.')
    expect(result.audioFrames.length).toBeGreaterThan(0)
  })

  it('marks every stage in causal order', async () => {
    const result = await runTurn([], [new Int16Array(320)], deps())
    const m = result.latency.marks
    expect(m.userStopped).toBeDefined()
    expect(m.sttFinal!).toBeLessThan(m.llmFirstToken!)
    expect(m.llmFirstToken!).toBeLessThanOrEqual(m.firstClause!)
    expect(m.firstClause!).toBeLessThanOrEqual(m.firstAudio!)
    expect(result.latency.timeToFirstAudioMs).toBe(m.firstAudio)
  })

  it('starts TTS on the first clause before the LLM has finished streaming', async () => {
    const clauses: string[] = []
    const result = await runTurn(
      [],
      [new Int16Array(320)],
      deps({ onClause: (c: string) => clauses.push(c) })
    )
    // The reply has two sentences, so we should have spoken at least two clauses,
    // and the first clause mark must precede the first audio.
    expect(clauses.length).toBeGreaterThanOrEqual(2)
    expect(clauses[0]).toBe('That is a great point.')
    expect(result.latency.marks.firstClause!).toBeLessThanOrEqual(result.latency.marks.firstAudio!)
  })

  it('flushes a trailing clause that never hit a boundary', async () => {
    const clauses: string[] = []
    await runTurn(
      [],
      [new Int16Array(320)],
      deps({
        llm: new MockLlmAdapter({
          reply: 'no terminal punctuation here',
          firstTokenDelayMs: 0,
          perTokenDelayMs: 0
        }),
        onClause: (c: string) => clauses.push(c)
      })
    )
    expect(clauses).toEqual(['no terminal punctuation here'])
  })
})
