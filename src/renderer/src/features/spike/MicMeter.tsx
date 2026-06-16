import { Mic, MicOff } from 'lucide-react'
import { useMicLevel } from '../../audio/useMicLevel'

/** Live microphone input meter — proves the capture path works end to end. */
export function MicMeter({ active }: { active: boolean }): JSX.Element {
  const { level, error } = useMicLevel(active)
  const pct = Math.min(100, Math.round(level * 180))

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <MicOff className="h-3.5 w-3.5" />
        <span>Mic unavailable: {error}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Mic className="h-3.5 w-3.5 text-text-muted" />
      <div className="h-1.5 w-44 overflow-hidden rounded-full bg-text/10">
        <div
          className="h-full rounded-full bg-text/80 transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
