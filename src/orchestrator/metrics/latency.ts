/**
 * Latency instrumentation for the voice loop.
 *
 * The whole product lives or dies on time-to-first-audio (how long after the user stops
 * speaking until they hear the AI). We mark each pipeline stage relative to the moment the
 * user's turn ended, so a regression in any single stage is visible — and so the latency
 * dashboard and CI have real numbers to track.
 */
export type LatencyStage =
  | 'userStopped'
  | 'sttFinal'
  | 'llmFirstToken'
  | 'firstClause'
  | 'firstAudio'

export const STAGE_ORDER: readonly LatencyStage[] = [
  'userStopped',
  'sttFinal',
  'llmFirstToken',
  'firstClause',
  'firstAudio'
]

export interface TurnLatency {
  /** Milliseconds since the turn started, per stage. */
  marks: Partial<Record<LatencyStage, number>>
  /** The headline metric: time from "user stopped" to "first audio out". */
  timeToFirstAudioMs?: number
}

export class LatencyTracker {
  private readonly startedAt: number
  private readonly marks: Partial<Record<LatencyStage, number>> = {}

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = this.now()
  }

  mark(stage: LatencyStage): void {
    this.marks[stage] = this.now() - this.startedAt
  }

  get(stage: LatencyStage): number | undefined {
    return this.marks[stage]
  }

  report(): TurnLatency {
    return { marks: { ...this.marks }, timeToFirstAudioMs: this.marks.firstAudio }
  }
}

/** Linear-interpolation percentile (p in [0, 100]). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN
  const arr = [...values].sort((a, b) => a - b)
  if (arr.length === 1) return arr[0]
  const rank = (p / 100) * (arr.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return arr[lo]
  return arr[lo] + (arr[hi] - arr[lo]) * (rank - lo)
}

export interface LatencySummary {
  count: number
  p50: number
  p95: number
  min: number
  max: number
  mean: number
}

/** Aggregates time-to-first-audio across many turns for the dashboard. */
export class LatencyAggregator {
  private readonly ttas: number[] = []

  add(report: TurnLatency): void {
    if (report.timeToFirstAudioMs != null) this.ttas.push(report.timeToFirstAudioMs)
  }

  addValue(ms: number): void {
    this.ttas.push(ms)
  }

  summary(): LatencySummary {
    const n = this.ttas.length
    if (n === 0) return { count: 0, p50: NaN, p95: NaN, min: NaN, max: NaN, mean: NaN }
    const sum = this.ttas.reduce((a, b) => a + b, 0)
    return {
      count: n,
      p50: percentile(this.ttas, 50),
      p95: percentile(this.ttas, 95),
      min: Math.min(...this.ttas),
      max: Math.max(...this.ttas),
      mean: sum / n
    }
  }
}
