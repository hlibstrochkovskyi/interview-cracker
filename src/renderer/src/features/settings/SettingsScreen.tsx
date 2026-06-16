import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, ShieldCheck, Trash2, Check } from 'lucide-react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { useSessionStore } from '../../store/session'

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  set: { label: 'Key saved in your OS keychain', tone: 'text-success' },
  env: { label: 'Using ANTHROPIC_API_KEY from your environment', tone: 'text-success' },
  none: { label: 'No key set — sessions run in mock mode', tone: 'text-text-muted' }
}

export function SettingsScreen(): JSX.Element {
  const { keyStatus, refreshKeyStatus, saveKey, clearKey, closeSettings } = useSessionStore()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refreshKeyStatus()
  }, [refreshKeyStatus])

  const onSave = async (): Promise<void> => {
    if (!draft.trim()) return
    setSaving(true)
    await saveKey(draft.trim())
    setDraft('')
    setSaving(false)
  }

  const status = STATUS_COPY[keyStatus]

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center px-3">
        <Button variant="ghost" size="sm" onClick={closeSettings}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </header>

      <main className="mx-auto w-full max-w-lg px-8 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <Card className="mt-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-medium">Anthropic API key</h2>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Used for real Claude sessions. Stored encrypted in your OS keychain — it never leaves
            this machine except in calls to Anthropic, and is never shown back to you.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-…"
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
            <span className={`text-xs ${status.tone}`}>{status.label}</span>
            {keyStatus === 'set' && (
              <Button variant="ghost" size="sm" onClick={() => void clearKey()}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
        </Card>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          Default model is Claude Opus 4.8. Mock mode needs no key and costs nothing.
        </p>
      </main>
    </div>
  )
}
