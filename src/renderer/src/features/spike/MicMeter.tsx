import { Mic, MicOff } from 'lucide-react'
import { useMicLevel } from '../../audio/useMicLevel'

/** Live microphone input meter — proves the capture path works end to end. */
export function MicMeter({ active }: { active: boolean }): JSX.Element {
  const { level, error } = useMicLevel(active)
  const pct = Math.min(100, Math.round(level * 180))

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <MicOff className="h-4 w-4" />
        <span>Mic unavailable: {error}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Mic className="h-4 w-4 text-text-muted" />
      <div className="h-2 w-40 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
