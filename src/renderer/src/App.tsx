import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, AudioLines, PlayCircle, ShieldCheck } from 'lucide-react'
import { Button } from './components/Button'
import { Backdrop } from './components/Backdrop'
import { useSessionStore } from './store/session'
import { SpikeScreen } from './features/spike/SpikeScreen'
import type { AppInfo } from '@shared/schemas'

function Home(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const enter = useSessionStore((s) => s.enter)

  useEffect(() => {
    window.api
      ?.getAppInfo()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Draggable custom titlebar. */}
      <header className="drag-region h-11 shrink-0" />

      <main className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full max-w-xl flex-col items-center"
        >
          {/* Glassy app glyph with a soft halo. */}
          <div className="relative mb-7">
            <div className="glow-cool absolute -inset-6 rounded-full blur-2xl" />
            <div className="glass relative flex h-[68px] w-[68px] items-center justify-center rounded-2xl">
              <AudioLines className="h-7 w-7 text-text" strokeWidth={1.75} />
            </div>
          </div>

          <h1 className="text-sheen text-[44px] font-semibold leading-none tracking-tightest">
            The Interview
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-text-muted">
            Practice with an AI interviewer, then get an honest, specific report on how you actually
            did.
          </p>

          <div className="mt-9 flex items-center justify-center gap-3">
            <Button size="lg" onClick={() => void enter()}>
              <Mic className="h-[18px] w-[18px]" strokeWidth={2} />
              Start a session
            </Button>
            <Button size="lg" variant="secondary" onClick={() => void enter()}>
              <PlayCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Try demo mode
            </Button>
          </div>
        </motion.div>
      </main>

      <footer className="flex shrink-0 items-center justify-between px-6 py-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Local-first · your data stays on this machine
        </span>
        <span className="tabular-nums text-text/40">
          {info
            ? `v${info.version} · Electron ${info.electron} · Node ${info.node} · ${info.platform}`
            : 'Loading…'}
        </span>
      </footer>
    </div>
  )
}

export default function App(): JSX.Element {
  const view = useSessionStore((s) => s.view)
  return (
    <div className="relative h-screen overflow-hidden text-text">
      <Backdrop />
      <div className="relative z-10 h-full">{view === 'session' ? <SpikeScreen /> : <Home />}</div>
    </div>
  )
}
