import { describe, it, expect } from 'vitest'
import { LatencyTracker, LatencyAggregator, percentile } from '@orchestrator/metrics/latency'

/** A deterministic clock that returns 0, 1, 2, … on each call. */
function counter(): () => number {
  let n = -1
  return () => ++n
}

describe('LatencyTracker', () => {
  it('records marks relative to turn start and exposes time-to-first-audio', () => {
    const tracker = new LatencyTracker(counter()) // first call (start) = 0
    tracker.mark('userStopped') // 1
    tracker.mark('sttFinal') // 2
    tracker.mark('llmFirstToken') // 3
    tracker.mark('firstClause') // 4
    tracker.mark('firstAudio') // 5

    const report = tracker.report()
    expect(report.marks.sttFinal).toBeLessThan(report.marks.llmFirstToken!)
    expect(report.marks.firstClause).toBeLessThan(report.marks.firstAudio!)
    expect(report.timeToFirstAudioMs).toBe(report.marks.firstAudio)
  })

  it('leaves time-to-first-audio undefined if no audio was produced', () => {
    const tracker = new LatencyTracker(counter())
    tracker.mark('sttFinal')
    expect(tracker.report().timeToFirstAudioMs).toBeUndefined()
  })
})

describe('percentile', () => {
  it('interpolates between values', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
    expect(percentile([1, 2, 3, 4], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4], 100)).toBe(4)
  })

  it('handles edge sizes', () => {
    expect(percentile([], 50)).toBeNaN()
    expect(percentile([42], 95)).toBe(42)
  })
})

describe('LatencyAggregator', () => {
  it('summarizes time-to-first-audio across turns', () => {
    const agg = new LatencyAggregator()
    for (const ms of [100, 200, 300, 400]) agg.addValue(ms)
    const s = agg.summary()
    expect(s.count).toBe(4)
    expect(s.min).toBe(100)
    expect(s.max).toBe(400)
    expect(s.mean).toBe(250)
    expect(s.p50).toBe(250)
  })

  it('ignores reports without audio', () => {
    const agg = new LatencyAggregator()
    agg.add({ marks: {} })
    agg.add({ marks: { firstAudio: 800 }, timeToFirstAudioMs: 800 })
    expect(agg.summary().count).toBe(1)
  })
})
