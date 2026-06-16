import { Card } from '../../components/Card'
import type { TurnRecord } from '../../store/session'

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN
  const arr = [...values].sort((a, b) => a - b)
  if (arr.length === 1) return arr[0]
  const rank = (p / 100) * (arr.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (rank - lo)
}

const fmt = (n?: number): string => (n == null || Number.isNaN(n) ? '—' : `${Math.round(n)}ms`)

const STAGES: { key: keyof TurnRecord['latency']['marks']; label: string }[] = [
  { key: 'sttFinal', label: 'STT' },
  { key: 'llmFirstToken', label: 'LLM' },
  { key: 'firstClause', label: 'Clause' },
  { key: 'firstAudio', label: 'Audio' }
]

export function LatencyDashboard({ turns }: { turns: TurnRecord[] }): JSX.Element {
  const ttas = turns.map((t) => t.ttfaMs).filter((v): v is number => v != null)
  const last = turns.at(-1)
  const lastTta = last?.ttfaMs
  const withinTarget = lastTta != null && lastTta < 1800

  return (
    <Card className="w-full">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text-muted">Time-to-first-audio</h3>
        <span className="text-xs text-text-muted">target &lt; 1800ms</span>
      </div>

      <div className="mt-1 flex items-baseline gap-3">
        <span
          className={`text-4xl font-semibold tabular-nums ${
            lastTta == null ? 'text-text-muted' : withinTarget ? 'text-success' : 'text-warning'
          }`}
        >
          {fmt(lastTta)}
        </span>
        <span className="text-sm text-text-muted">
          p50 {fmt(percentile(ttas, 50))} · p95 {fmt(percentile(ttas, 95))} · {ttas.length} turns
        </span>
      </div>

      {last && (
        <div className="mt-4 space-y-1.5">
          {STAGES.map((stage) => {
            const v = last.latency.marks[stage.key]
            const width = lastTta ? Math.min(100, ((v ?? 0) / lastTta) * 100) : 0
            return (
              <div key={stage.key} className="flex items-center gap-3 text-xs">
                <span className="w-14 text-text-muted">{stage.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-text/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums text-text-muted">{fmt(v)}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
