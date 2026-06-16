import { ArrowLeft, Square } from 'lucide-react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { useSessionStore } from '../../store/session'
import { SpeakingIndicator } from './SpeakingIndicator'
import { MicMeter } from './MicMeter'
import { LatencyDashboard } from './LatencyDashboard'

export function SpikeScreen(): JSX.Element {
  const { status, speaking, currentTurn, captions, turns, leave } = useSessionStore()
  const running = status === 'running'
  const caption = captions.join(' ')

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center justify-between px-3">
        <Button variant="ghost" size="sm" onClick={() => void leave()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="flex items-center gap-2 text-xs text-text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-breathe bg-accent' : 'bg-white/30'}`}
          />
          {running ? `Mock session · turn ${currentTurn}` : 'Session complete'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void leave()} disabled={!running}>
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 overflow-auto px-8 py-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col items-center justify-center gap-9">
          <SpeakingIndicator active={speaking} />
          <Card className="min-h-[7rem] w-full max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Interviewer</p>
            <p className="mt-2.5 select-text text-lg leading-relaxed text-text">
              {caption || (running ? 'Thinking…' : 'The interview has wrapped up.')}
            </p>
          </Card>
          <MicMeter active={running} />
        </section>

        <section className="flex min-h-0 flex-col gap-5">
          <LatencyDashboard turns={turns} />
          <Card className="flex min-h-0 flex-1 flex-col">
            <h3 className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Turns</h3>
            <ul className="mt-3 space-y-1 overflow-auto text-sm">
              {turns.length === 0 && <li className="text-text-muted">No turns yet…</li>}
              {turns.map((t) => (
                <li
                  key={t.turn}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
                >
                  <span className="w-6 shrink-0 tabular-nums text-text-muted">{t.turn}</span>
                  <span className="flex-1 truncate text-text-muted">{t.assistantText}</span>
                  <span className="shrink-0 tabular-nums text-text">
                    {t.ttfaMs != null ? `${Math.round(t.ttfaMs)}ms` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </main>
    </div>
  )
}
