import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Sparkles, PlayCircle } from 'lucide-react'
import { Button } from './components/Button'
import type { AppInfo } from '@shared/schemas'

export default function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api
      ?.getAppInfo()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Custom draggable titlebar for the native, frameless feel. */}
      <header className="drag-region h-10 shrink-0" />

      <main className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xl"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Sparkles className="h-7 w-7" />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight">The Interview</h1>
          <p className="mx-auto mt-3 max-w-md text-text-muted">
            Practice with an AI interviewer, then get an honest, specific report on how you actually
            did.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg">
              <Mic className="h-4 w-4" />
              Start a session
            </Button>
            <Button size="lg" variant="outline">
              <PlayCircle className="h-4 w-4" />
              Try demo mode
            </Button>
          </div>
        </motion.div>
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t border-border px-6 py-3 text-xs text-text-muted">
        <span>Local-first · your data stays on this machine</span>
        <span className="tabular-nums">
          {info
            ? `v${info.version} · Electron ${info.electron} · Node ${info.node} · ${info.platform}`
            : 'Loading…'}
        </span>
      </footer>
    </div>
  )
}
