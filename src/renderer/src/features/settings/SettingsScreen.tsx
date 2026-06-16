import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, ShieldCheck, Trash2, Check, Cpu } from 'lucide-react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { cn } from '../../lib/cn'
import { MODELS } from '../../lib/models'
import { useSessionStore } from '../../store/session'
import type { KeyProvider, KeyStatus } from '@shared/schemas'

const STATUS_COPY: Record<KeyStatus, { label: string; tone: string }> = {
  set: { label: 'Saved in your OS keychain', tone: 'text-success' },
  env: { label: 'Loaded from your environment', tone: 'text-success' },
  none: { label: 'Not set', tone: 'text-text-muted' }
}

function KeyCard({
  provider,
  title,
  blurb,
  placeholder
}: {
  provider: KeyProvider
  title: string
  blurb: string
  placeholder: string
}): JSX.Element {
  const { keyStatus, saveKey, clearKey } = useSessionStore()
  const status = keyStatus[provider]
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const onSave = async (): Promise<void> => {
    if (!draft.trim()) return
    setSaving(true)
    await saveKey(provider, draft.trim())
    setDraft('')
    setSaving(false)
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-text-muted" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-text-muted">{blurb}</p>

      <div className="mt-4 flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="no-drag h-10 flex-1 select-text rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-text-muted/60 focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        <Button onClick={() => void onSave()} disabled={!draft.trim() || saving}>
          <Check className="h-4 w-4" />
          Save
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className={`text-xs ${STATUS_COPY[status].tone}`}>{STATUS_COPY[status].label}</span>
        {status === 'set' && (
          <Button variant="ghost" size="sm" onClick={() => void clearKey(provider)}>
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </Card>
  )
}

export function SettingsScreen(): JSX.Element {
  const { model, setModel, refreshKeyStatus, closeSettings } = useSessionStore()

  useEffect(() => {
    void refreshKeyStatus()
  }, [refreshKeyStatus])

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center px-3">
        <Button variant="ghost" size="sm" onClick={closeSettings}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </header>

      <main className="mx-auto w-full max-w-lg overflow-auto px-8 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Keys are encrypted in your OS keychain — never written in plaintext, never shown back.
        </p>

        <div className="mt-6 space-y-4">
          <KeyCard
            provider="anthropic"
            title="Anthropic API key"
            blurb="Powers the AI interviewer (Claude). Required to run a real session."
            placeholder="sk-ant-…"
          />
          <KeyCard
            provider="deepgram"
            title="Deepgram API key"
            blurb="Real-time speech-to-text so the app hears what you say. Optional — without it, live sessions use a stand-in transcript."
            placeholder="dg-…"
          />

          <Card>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-medium">Model</h2>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Cheaper models are faster and lighter on your bill; pricier ones are sharper.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={cn(
                    'no-drag rounded-md border p-3 text-left transition-colors',
                    model === m.id
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-border hover:bg-surface'
                  )}
                >
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">{m.hint}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          Demo mode needs no keys and costs nothing.
        </p>
      </main>
    </div>
  )
}
