/**
 * Mock voice-loop spike (no keys, no cost).
 *
 * Runs several turns through the real pipeline using mock adapters with simulated vendor
 * delays, and prints per-stage latency plus a p50/p95 summary. This validates the plumbing and
 * the instrumentation; swap in real adapters (with keys) to get true numbers.
 *
 *   npm run spike
 */
import { runTurn } from '../src/orchestrator/pipeline'
import { MockSttAdapter, MockLlmAdapter, MockTtsAdapter } from '../src/orchestrator/adapters/mock'
import { LatencyAggregator } from '../src/orchestrator/metrics/latency'

const TURNS = 5
const ms = (n?: number): string => (n == null ? '   –' : `${n.toFixed(0).padStart(4)}`)

async function main(): Promise<void> {
  const agg = new LatencyAggregator()
  console.log(`\nMock voice spike — ${TURNS} turns (simulated vendor delays)\n`)

  for (let i = 0; i < TURNS; i++) {
    const result = await runTurn([], [new Int16Array(320)], {
      stt: new MockSttAdapter(),
      llm: new MockLlmAdapter(),
      tts: new MockTtsAdapter(),
      voiceId: 'mock-voice'
    })
    agg.add(result.latency)
    const m = result.latency.marks
    console.log(
      `Turn ${i + 1}  TTFA ${ms(result.latency.timeToFirstAudioMs)}ms` +
        `   [stt ${ms(m.sttFinal)} · llm ${ms(m.llmFirstToken)} · clause ${ms(m.firstClause)} · audio ${ms(m.firstAudio)}]` +
        `   frames ${result.audioFrames.length}`
    )
  }

  const s = agg.summary()
  console.log(
    `\nTime-to-first-audio over ${s.count} turns:  ` +
      `p50 ${s.p50.toFixed(0)}ms · p95 ${s.p95.toFixed(0)}ms · min ${s.min.toFixed(0)}ms · max ${s.max.toFixed(0)}ms`
  )
  console.log(
    '\nTarget: < 1800ms acceptable, < 1200ms aggressive.\n' +
      'These are MOCK delays — real STT/LLM/TTS keys are needed for true latency.\n'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
