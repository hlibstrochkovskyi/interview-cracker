import { ArrowLeft, Square, Mic } from 'lucide-react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { useSessionStore } from '../../store/session'
import { modelLabel } from '../../lib/models'
import { SpeakingIndicator } from './SpeakingIndicator'
import { MicMeter } from './MicMeter'
import { LatencyDashboard } from './LatencyDashboard'

export function SpikeScreen(): JSX.Element {
  const {
    mode,
    status,
    llmKind,
    sttKind,
    model,
    speaking,
    listening,
    currentTurn,
    captions,
    userTranscript,
    turns,
    leave,
    pushToTalkStart,
    pushToTalkEnd
  } = useSessionStore()

  const running = status === 'running'
  const caption = captions.join(' ')
  const live = mode === 'live'
  const label =
    mode === 'demo'
      ? 'Demo'
      : `${llmKind === 'claude' ? `Claude ${modelLabel(model)}` : 'Mock LLM'}`

  // In live mode you may talk whenever the interviewer isn't speaking.
  const canTalk = live && running && !speaking

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center justify-between px-3">
        <Button variant="ghost" size="sm" onClick={() => void leave()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="flex items-center gap-2 text-xs text-text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-breathe bg-accent' : 'bg-text/30'}`}
          />
          {running ? `${label} · turn ${currentTurn}` : 'Session complete'}
          {live && sttKind === 'mock' && (
            <span className="text-warning">· no Deepgram key (stand-in transcript)</span>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void leave()} disabled={!running}>
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 overflow-auto px-8 py-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col items-center justify-center gap-8">
          <SpeakingIndicator active={speaking} />

          <Card className="min-h-[7rem] w-full max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Interviewer</p>
            <p className="mt-2.5 select-text text-lg leading-relaxed text-text">
              {caption ||
                (speaking ? 'Thinking…' : running ? 'Listening…' : 'The interview has wrapped up.')}
            </p>
          </Card>

          {live && userTranscript && (
            <Card className="w-full max-w-xl border-accent/20 bg-accent/5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">You said</p>
              <p className="mt-2 select-text leading-relaxed text-text">{userTranscript}</p>
            </Card>
          )}

          {live ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={!canTalk && !listening}
                onPointerDown={() => void pushToTalkStart()}
                onPointerUp={() => void pushToTalkEnd()}
                onPointerLeave={() => listening && void pushToTalkEnd()}
                className={`no-drag flex h-16 w-16 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:opacity-40 ${
                  listening
                    ? 'scale-110 bg-danger text-white shadow-lg'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
              >
                <Mic className="h-6 w-6" />
              </button>
              <span className="text-xs text-text-muted">
                {listening
                  ? 'Listening… release to send'
                  : speaking
                    ? 'Interviewer is speaking…'
                    : 'Hold to talk'}
              </span>
            </div>
          ) : (
            <MicMeter active={running} />
          )}
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
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-text/[0.04]"
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
