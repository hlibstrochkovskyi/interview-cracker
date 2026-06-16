# The Interview

An interactive, voice-based AI interview-training **desktop app** (Electron + React). You
launch the app, talk to an AI interviewer over your camera/mic for 20–60+ minutes, and
afterwards get a detailed, honest feedback report on how you actually did.

> The product is the **feedback**, not the conversation. The live interview is how we collect
> the data; the report is the payoff.

See the engineering source of truth:
[`docs/plan/THE_INTERVIEW_IMPLEMENTATION_PLAN.md`](docs/plan/THE_INTERVIEW_IMPLEMENTATION_PLAN.md).

## Status

**M0 — scaffold & foundations.** App shell, hardened renderer, design-system foundation,
testable core modules (clause chunker, interview-plan state machine, barge-in truncation),
and CI are in place. The realtime voice loop and feedback engine are built milestone by
milestone per the plan.

## Stack

- **Electron** + **electron-vite** (main / preload / renderer), **TypeScript strict** end to end
- **React 18** + **Tailwind CSS** + **Framer Motion** + **lucide-react** for a modern, native-feeling UI
- **Zustand** (UI state), **Zod** (IPC + structured-output validation)
- **Vitest** for unit/integration tests; **GitHub Actions** CI
- Local-first: **SQLite** (added at M0/M4), **bring-your-own API keys** in the OS keychain

AI providers (STT / LLM / TTS) sit behind swappable adapter interfaces (`src/shared/adapters.ts`)
with real / mock / replay implementations. Demo mode replays fixtures — no keys, no cost.

## Architecture (short version)

- **Main process** (trusted Node): window, menu, auto-update, OS keychain, SQLite, supervises
  the orchestrator.
- **Orchestrator** (Node; in main for M0–M2, extracted to a `utilityProcess` at M3): the
  realtime engine — VAD/endpointing → STT → conversation controller → LLM → clause chunker → TTS.
- **Renderer** (sandboxed Chromium): React UI, mic capture, Web Audio playback, MediaPipe gaze
  — never holds a key, never calls a vendor.
- Audio rides an in-process **MessagePort**; control rides typed, Zod-validated **IPC**.

## Development

```bash
npm install        # one-time
npm run dev        # launch the app with HMR
npm run typecheck  # tsc on node + web projects
npm run lint       # eslint
npm test           # vitest
npm run build      # bundle main/preload/renderer
npm run dist       # package installers (electron-builder)
```

Requires Node 20+ (see `.nvmrc`). Copy `.env.example` to `.env` for dev convenience.

## Project layout

```
src/
  main/          Electron main: window, IPC, (later) db + updater + keychain
  preload/       contextBridge — the only renderer-facing API
  renderer/      React app (UI, audio capture/playback, MediaPipe)
  orchestrator/  realtime engine: controller, chunker, endpointing, eval (no Electron imports)
  shared/        channel names, Zod schemas, types, adapter interfaces
test/            vitest unit/integration + fixtures
docs/plan/       the implementation plan
```
