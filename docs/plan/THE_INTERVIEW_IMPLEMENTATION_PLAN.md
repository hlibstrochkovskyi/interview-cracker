# The Interview — Technical Implementation Plan (Electron Desktop)

> An interactive, voice-based AI interview-training **desktop app** (Electron + React).
> You launch the app, talk to an AI interviewer over your camera/mic for 20–60+ minutes,
> and afterwards get a detailed, honest feedback report on how you actually did.

This document is the engineering source of truth. It is opinionated on purpose. Where a
decision is genuinely open it is marked **DECISION**. Known traps are **⚠️ TRAP**. Claims
that depend on fast-moving vendor facts are **VERIFY** — confirm current reality before
relying on them.

---

## 0. North star, scope, and non-goals

**North star:** The product is the *feedback*, not the conversation. Anyone can wire up
"talk to an AI." What makes this lovable is honest, specific, actionable feedback the user
almost never gets in real life. The live interview is the data-collection mechanism; the
**report is the payoff**.

**Primary goal:** a portfolio-grade desktop app that proves you can build a hard, real-time,
AI-orchestrated full-stack system end to end — shipped to 100%, documented, tested, packaged,
signed-ish, auto-updating. Depth over breadth.

**The two genuinely hard problems** (everything else is plumbing):

1. **Real-time conversational voice with natural turn-taking** — low latency, barge-in,
   endpointing. This is what makes it feel alive or dead.
2. **Conversation coherence over 45+ minutes** — a conversation-state / agent-design problem,
   **not** a RAG problem.

**Wedge (DECISION — locked for V1): behavioral interviewing.** Most universal, the rubric
(STAR / specificity / structure) is well-defined and gradeable, and the "rewrite your weak
answer" feature shines brightest here. The rubric layer is pluggable so technical/system-design
modes can be added later without re-architecting.

**Non-goals (V1):**
- No realistic 3D lip-synced avatar (uncanny valley, huge time sink). Static portrait + a
  speaking indicator reads as intentional.
- No cheat detection / surveillance. Camera is **coaching feedback only** (gaze, presence,
  pacing) — there is no one to cheat in your own practice.
- No mobile app. **Desktop-first** (macOS / Windows / Linux via Electron).
- No multi-tenant cloud. **Local-first**: data lives on the user's machine, API keys are
  bring-your-own (BYO) in the OS keychain.

---

## 1. Why Electron — and the architectural consequences

Going desktop instead of browser-on-a-server is a real architectural shift, almost all of it
simplifying:

| Concern | Browser+server version | **Electron version (this plan)** |
|---|---|---|
| Backend host | Fly.io / Railway / VPS | **None** — orchestration runs in the app's Node process |
| Audio transport | WebSocket carrying PCM over the network | **In-process `MessagePort`** (renderer ↔ main) — no network hop, lower latency |
| Database | Postgres + pgvector | **SQLite** (`better-sqlite3` + Drizzle); `sqlite-vec` only if RAG appears |
| API keys / cost | Server holds keys; you pay per visitor | **BYO keys in OS keychain** (`safeStorage`); the user pays for their own usage |
| Deploy | CI → container → host | CI → **`electron-builder`** → signed installers + **auto-update** via GitHub Releases |
| Privacy | "camera never leaves browser" | Even stronger: **nothing leaves the machine** except calls to the user's chosen AI vendors |

**The big win:** the BYO-key + local-first model dissolves the original §7 cost problem. You
are no longer paying frontier-inference costs for every recruiter who tries it. Demo mode
(canned/replayed responses) covers the "try it with zero setup" path.

**The cost:** Electron-specific complexity — the multi-process security model, native-module
rebuilds (`better-sqlite3`), packaging/signing/notarization, and auto-update. These are
budgeted as first-class milestones, not afterthoughts.

**DECISION — runtime:** Electron's main process **is** the backend. We do **not** split into a
Node gateway + Python eval worker (the original plan's trap). One TypeScript runtime,
shared types end to end.

---

## 2. Process & threading model

Electron is multi-process. We use it deliberately and harden every boundary (§8).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS  (Node, trusted)                                              │
│  - app lifecycle, BrowserWindow, native menu, tray, auto-update           │
│  - owns OS keychain (safeStorage) — the ONLY place secrets exist           │
│  - SQLite (better-sqlite3 + Drizzle)                                        │
│  - spawns + supervises the Orchestrator                                    │
│                                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ ORCHESTRATOR  (utilityProcess, Node)  ── the realtime engine       │   │
│   │   VAD/endpointing arbiter → STT adapter → Conversation Controller  │   │
│   │   (state machine + context manager + scratchpad) → LLM adapter →   │   │
│   │   clause chunker → TTS adapter → audio frames out                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
└───────────────▲───────────────────────────────────────────────▲──────────┘
                │ IPC (typed JSON control)        MessagePort     │ (binary audio)
                │ contextBridge-exposed, validated                │
┌───────────────┴─────────────────────────────────────────────────┴────────┐
│ RENDERER PROCESS  (Chromium, sandboxed, untrusted)                        │
│  - React UI (the whole app surface)                                       │
│  - getUserMedia mic capture → AudioWorklet → PCM frames + cheap VAD gate  │
│  - Web Audio playback of returned TTS frames                              │
│  - MediaPipe Face Landmarker (gaze/pose) — 100% in-renderer, never sent   │
│  - NEVER holds an API key, NEVER makes a vendor call                      │
└────────────────────────────────────────────────────────────────────────┘
       preload.ts (isolated bridge): exposes a tiny, typed, validated API only
```

**Why a `utilityProcess` for the Orchestrator** (not just main): a 45-minute session does a
lot of streaming work; isolating it keeps the main process responsive for window/menu/IPC and
gives a clean crash boundary — if the engine dies mid-session, main restarts it and the
renderer shows graceful degradation instead of a frozen window. For M0–M2 it's acceptable to
run the orchestrator *in* main and extract it to a utility process at M3; the adapter
interfaces make that move mechanical.

**Why VAD partly in the renderer:** running a cheap energy/Silero VAD gate in an AudioWorklet
means we only ship audio across the MessagePort when there's plausibly speech — less IPC
traffic, lower latency. The *authoritative* endpointing decision still lives in the
Orchestrator (it has STT context). See §9.

---

## 3. Architecture overview — the voice loop

```
 Renderer (Chromium)                         Orchestrator (Node, in main/utility)
 ┌──────────────────────┐                    ┌───────────────────────────────────────┐
 │ mic (getUserMedia)   │                    │                                       │
 │   → AudioWorklet      │  PCM16 frames      │  VAD/endpointing arbiter              │
 │   → cheap VAD gate    │ ───MessagePort───► │     → streaming STT adapter ───┐      │
 │                      │                    │                                 ▼      │
 │ Web Audio playback   │ ◄──MessagePort──── │  Conversation Controller               │
 │   (TTS frames)       │  PCM/Opus frames   │   - interview plan (state machine)     │
 │                      │                    │   - rolling context + summary          │
 │ MediaPipe (gaze)     │   IPC: control,    │   - interviewer scratchpad             │
 │   → derived stats    │   captions, state  │            │                           │
 │                      │ ◄───────────────── │     LLM adapter (streaming)            │
 │ React UI + captions  │                    │            │ → clause chunker          │
 └──────────────────────┘                    │            ▼                           │
                                             │     streaming TTS adapter ─► frames ───┘
                                             └───────────────────────────────────────┘
   Persistence: SQLite (sessions, turns, scratchpad, reports, personas, settings)
                User data dir (app.getPath('userData')); optional audio files on disk
```

### Data flow per turn
1. Mic PCM16 frames stream from the AudioWorklet; the renderer VAD gate opens on speech and
   forwards frames over the **MessagePort**.
2. The endpointing arbiter (VAD + grace window + optional semantic-complete check) decides the
   user's turn is **done**, not merely paused.
3. Streaming STT yields the final transcript (with word timestamps for filler/pace stats).
4. The Controller updates state (phase, time budget, scratchpad) and assembles the LLM prompt.
5. The LLM streams; the **clause chunker** splits at clause/sentence boundaries (min-length
   floor) and forwards each chunk to TTS immediately.
6. TTS streams audio frames back over the MessagePort; the renderer plays them via Web Audio.
7. On **barge-in** (user speaks during playback): stop playback, and **truncate the stored
   assistant message to only what actually played** (§9).

---

## 4. Latency budget

Target **time-to-first-audio** after the user stops speaking: **< 1.2s aggressive,
< 1.8s acceptable** (the in-process MessagePort removes the network hop the browser version
paid, so we can be stricter). Beyond ~2.5s it feels dead. **VERIFY** against chosen vendors.

| Stage | Budget | Notes |
|---|---|---|
| Endpoint decision (silence wait) | 200–500 ms | Tunable; trades responsiveness vs cutting people off |
| STT finalization | 100–300 ms | Streaming STT means most work is already done |
| LLM time-to-first-token | 300–800 ms | Model- and load-dependent |
| First speakable clause | 100–300 ms | Don't wait for the full response |
| TTS time-to-first-byte | 120–350 ms | Biggest vendor differentiator |
| IPC + playback buffer | ~30–80 ms | In-process MessagePort, not a network socket |

Two levers dominate: **stream every stage**, and **start TTS on the first complete clause**.
A **latency dashboard** (per-stage timings, p50/p95) is a built-in dev panel and a CI metric —
build it in M0 and keep it.

---

## 5. Tech stack

Everything talking to an external AI service sits **behind an adapter interface** (§14) so it
is swappable and mockable. Good engineering and a clean build-vs-buy story.

### App shell & build
- **Electron** (latest LTS-ish stable line — **VERIFY**) with **`electron-vite`** for the
  main/preload/renderer build (modern Vite-based, far nicer than electron-forge+webpack).
- **electron-builder** for packaging + `electron-updater` for auto-update via GitHub Releases.
- **TypeScript strict** everywhere; shared types across all three processes.

### Renderer (UI)
- **React 18 + TypeScript + Vite**.
- **Tailwind CSS** + **shadcn/ui** (Radix primitives + Tailwind) for accessible, modern,
  fully-ownable components — the foundation of the design system (§6).
- **Framer Motion** (`motion`) for fluid, spring-based motion (the Apple-feel).
- **lucide-react** icons; **Inter** + system font stack for a native look.
- **getUserMedia / MediaStream** + **AudioWorklet** (mic capture, PCM, VAD gate);
  **Web Audio API** for playback + the speaking-indicator waveform.
- **MediaPipe Face Landmarker** (WASM/WebGL) for gaze/head-pose — entirely in-renderer.
- **Zustand** for UI state; **TanStack Query** optional (wrapping IPC reads of reports/history).

### Main / Orchestrator (Node)
- WebSocket/HTTP **clients** to vendors (in main only), session orchestration, controller,
  eval engine.
- **better-sqlite3** + **Drizzle ORM** (type-safe, migration-friendly) for local persistence.
- **Zod** for validating every IPC message and every structured LLM output.
- **electron `safeStorage`** (OS keychain) for API keys.

### AI services (behind adapters — **VERIFY** current best monthly)
- **STT (streaming):** Deepgram-class managed service; self-hosted Whisper if you want the
  infra challenge.
- **LLM (streaming, strong instruction-following, structured output):** Claude (Anthropic) or
  GPT class. Prompt-cache the persona+rubric system block.
- **TTS (streaming, voice variety):** ElevenLabs-class (voice range) vs Cartesia-class
  (lowest latency). This market changes monthly.

### Tooling
- **ESLint (flat config) + Prettier**, **Vitest** (unit/integration), **Playwright
  `_electron`** (E2E driving the packaged app), **GitHub Actions** CI on a
  macOS/Windows/Linux matrix.
- **Structured logging** (pino-class) with a per-session correlation id; the latency dashboard
  reads from it.

### Audio transport detail
- **DECISION:** renderer ↔ orchestrator audio rides an Electron **`MessagePort`**
  (`MessageChannelMain`), carrying **PCM16 16 kHz mono** frames (plenty for STT) upstream and
  **PCM/Opus** frames downstream. This is the in-process analogue of the browser version's
  WebSocket-PCM choice — same simplicity, no signaling/ICE/TURN. **WebRTC is the deliberately
  rejected alternative** (heavier, designed for *network* peers we don't have): document it in
  the README as a judgment call.

---

## 6. UI/UX design system (the "modern Apple/Google/Microsoft" bar)

Treat design as a first-class skill. Most backend-strong portfolios look terrible; this one
won't. Target a calm, confident, **content-first** aesthetic — the lovechild of macOS,
Material 3, and Fluent: generous whitespace, soft depth, restrained color, motion that
*informs* rather than decorates.

### Design tokens (single source of truth)
- **Color:** a neutral gray ramp + one brand accent; semantic tokens (`bg`, `surface`,
  `surface-elevated`, `border`, `text`, `text-muted`, `accent`, `success`, `warning`,
  `danger`). **Full light + dark** driven by Electron `nativeTheme` (respect the OS).
- **Type scale:** Inter (variable), modular scale (12/14/16/20/24/32/40), tight line-height on
  display, comfortable on body. Tabular numerals for stats/scores.
- **Spacing:** 4px base grid; components compose on 8/12/16/24.
- **Radius:** soft (8–14px) for the friendly-modern feel.
- **Elevation:** layered, low-contrast shadows (macOS-style), not hard drop shadows.
- **Motion:** Framer Motion spring presets (`gentle`, `snappy`); 150–250ms; respect
  `prefers-reduced-motion`. Shared-layout transitions between setup → live → report.

### Surfaces & key screens
1. **Home / dashboard** — start a session, recent sessions, progress sparkline. Big, calm,
   one obvious primary action.
2. **Session setup** — resume + JD ingestion, role/level/duration/type/persona, model choice
   (cost control). Wizard with a live "what this session will cover" preview.
3. **Live interview** — the centerpiece. Persona portrait + **speaking indicator** (animated
   waveform/orb), large **live captions**, current-question chip, a subtle phase/progress rail,
   mic state, and an unmissable **interrupt** affordance. Minimal chrome; the conversation is
   the UI. Frameless window with a custom draggable titlebar for the native-app feel.
4. **Report** — the product. Score summary, per-answer cards (quote → why → **rewrite**),
   filler/pace stats, gaze coaching, and cross-session progress charts. Designed to be read
   and re-read.
5. **Settings** — API keys (stored in keychain, never shown back in full), audio
   devices/headphone check, theme, data & privacy (export/delete), demo mode.

### Principles
- **Accessibility is non-negotiable:** Radix gives keyboard nav + ARIA; live captions double
  as a11y; honor reduced-motion and high-contrast; all interactive targets ≥ 40px.
- **Native integration:** OS theme, native menus, traffic-light/inset window controls per
  platform, dock/taskbar progress during a session, system notifications when a report is ready.
- **Empty/loading/error states are designed, not afterthoughts** — every screen has all four.

---

## 7. IPC & transport contracts

Two channels, both typed and validated:

- **Control plane — IPC (JSON):** request/response (`invoke`/`handle`) and main→renderer
  events. Every payload has a **Zod schema**; the preload bridge rejects anything that doesn't
  validate. Namespaced channels: `session:*`, `audio:*` (control only), `settings:*`,
  `report:*`, `keys:*`, `system:*`. No raw `ipcRenderer` is exposed — only a curated typed API.
- **Audio plane — MessagePort:** a `MessageChannelMain` port transferred to the renderer at
  session start carries binary audio frames both directions, plus tiny framing headers
  (sequence no., timestamp, `played-through` marker for barge-in accounting).

A single `shared/` package defines the channel names, the Zod schemas, and the derived TS
types so main, preload, and renderer cannot drift.

---

## 8. Security model (Electron hardening)

Desktop apps that run untrusted-ish content (resume/JD text, vendor responses) must be locked
down. Non-negotiable defaults:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the renderer.
- **Preload exposes a minimal, typed API via `contextBridge`** — never the raw `ipcRenderer`,
  never `require`, never Node globals.
- **Strict CSP** on the renderer; **no remote content loaded into a privileged context**;
  `webSecurity` on; block/limit `will-navigate` and `setWindowOpenHandler` (external links go
  to the OS browser).
- **API keys live only in the main process**, encrypted at rest via `safeStorage` (OS
  keychain). The renderer can ask "is a key set?" and "test this key," never read it.
- **All vendor network calls happen in main/orchestrator**, never the renderer.
- **Prompt injection:** resume + JD are user data, not instructions — delimited and the model
  told to ignore embedded commands. Low stakes, but a security-awareness signal.
- **Auto-update integrity:** signed releases, `electron-updater` verifies signatures;
  document code-signing (and macOS notarization) even if you ship unsigned dev builds.
- Dependency hygiene: `npm audit` in CI, Dependabot, lockfile committed.

---

## 9. Key design problems & subtle bugs

The things that separate "demo that works once" from "feels real."

- **Endpointing, not just VAD.** Naive silence thresholds cut off "um, let me think…".
  Combine the renderer VAD gate + a tunable grace window + (optional) a lightweight
  "is this utterance semantically complete" check in the arbiter. Silence threshold is a
  user-tunable setting.
- **Barge-in + ⚠️ the truncation bug.** On user speech during playback: stop playback
  immediately, and **trim the stored assistant message to only the audio that actually played**
  (tracked via the MessagePort `played-through` marker — frames acked as rendered by Web
  Audio). Storing the full generated text makes the model believe it said things the user never
  heard, and coherence silently rots. **Explicit test** asserts stored == played (§15).
- **Echo cancellation. ⚠️** Browser AEC is tuned for WebRTC playback; playing TTS via Web Audio
  and capturing separately may not cancel the AI's own voice → it interrupts itself. **MVP:
  recommend headphones** (a built-in headphone-check step) and test the speaker case explicitly
  later. Don't assume it "just works."
- **Clause chunking.** Split streaming LLM output at `. ! ? ;` and clause commas with a
  min-length floor (no two-word TTS fragments). Forward each chunk to TTS as it completes.
- **Context management for coherence (not RAG).** Feed the LLM: persona + rubric (system,
  prompt-cached) + plan state + rolling summary of old turns + last N verbatim turns +
  scratchpad. Recent turns verbatim, older ones summarized into a running "interview memory."
  Token count stays bounded; coherence stays high. ⚠️ Watch the *blandness* failure mode —
  over-summarizing makes the interviewer generic; the coherence test must assert it references
  **specific** earlier answers, not just "stays on topic."
- **Interview plan = flexible state machine.** Phases: intro → background → behavioral →
  technical → candidate-questions → wrap. Each phase has goals, a time budget, exit conditions.
  ⚠️ A rigid machine feels robotic — transitions are **soft targets**: allow digression and
  follow-ups, nudge toward completion as the time budget runs low. Pure, deterministic,
  fully unit-tested.
- **Interviewer scratchpad.** Structured running notes the controller maintains (claims to
  probe, planned follow-ups, observed strengths, red flags). Makes it feel like a real
  interviewer who remembers — and is the **exact structured input the feedback engine
  consumes**. Build once, use twice.
- **Resilience over a long session.** STT drop, LLM timeout, TTS error, orchestrator crash:
  retry/reconnect with backoff, fall back to on-screen text if TTS fails, restart a crashed
  utility process, and **persist the transcript incrementally** so nothing is ever lost. Never
  hard-crash the session.
- **Live captions / accessibility.** Current question + live transcript on screen — a11y and
  genuinely useful (re-read the question). Cheap, high value.

---

## 10. Data model (SQLite + Drizzle)

Local SQLite in `app.getPath('userData')`. Drizzle schema/migrations checked into the repo.

```
settings    (key TEXT PRIMARY KEY, value_json)            -- theme, thresholds, model defaults
                                                          -- (API keys NOT here — keychain only)
users       (id, display_name, created_at)               -- effectively single local user
sessions    (id, user_id, config_json, persona_id,
             status, started_at, ended_at)
turns       (id, session_id, role[user|ai], text,
             audio_path?, started_at, ended_at, phase,
             played_through INTEGER)                      -- barge-in accounting
scratchpad  (id, session_id, json)                        -- running interviewer notes
reports     (id, session_id, rubric_scores_json,
             filler_stats_json, annotated_transcript_json,
             gaze_stats_json?, summary, created_at)
personas    (id, name, system_prompt, voice_id,
             difficulty_modifiers_json, is_builtin)
```

`config_json` holds role, level, duration, interview type, model choices (cost control).
Transcript is always stored; audio files are **opt-in** (disk cost + privacy, §13).

---

## 11. The feedback engine (the actual product)

Inputs: full transcript + scratchpad + (renderer-computed) gaze/pace stats. Output: a report.

**Report contents:**
- **Per-answer rubric scoring** (STAR adherence, specificity vs vagueness, structure, and —
  in technical mode — correctness). Rubric is explicit, versioned, stored, not vibes.
- **Filler-word & pacing stats** from transcript + STT word timestamps.
- **Annotated transcript:** each weak answer flagged with *why*, plus a **rewritten stronger
  version**. This rewrite is the single most lovable feature — prioritize it.
- **Cross-session progress:** scores over time so the user can *see* improvement.

**⚠️ TRAP — keep the eval honest.** LLM-as-judge hallucinates and drifts run-to-run.
Mitigations: (1) **ground every judgment in quoted transcript spans** — the model must cite the
exact text it scores; (2) score against the **explicit rubric with defined levels**, not
open-ended "rate this"; (3) **structured JSON output, Zod-validated**; (4) **score each answer
independently** rather than the whole transcript at once (less drift). The credibility of the
entire product rests on the feedback not being made up.

---

## 12. Cost model & BYO-key (Electron changes this)

Because the app is local-first with **bring-your-own keys**, *the user pays for their own
usage* — the original "pay per recruiter visit" problem is gone. What remains:

- **Your dev spend.** You'll run many sessions building this. Mitigate with **demo mode**
  (canned/replayed responses behind the adapters), cheap models in dev, and recorded fixtures
  replayed in tests (§15).
- **Make model choice a session parameter** (cheap for practice, frontier for "real" runs);
  surface estimated cost/min in setup.
- **Demo mode is also the no-setup path:** a recruiter installs the app and tries a full
  scripted interview with **zero API keys and zero cost**. Build it early.
- **Prompt-cache** the persona+rubric system block to cut LLM cost on long sessions.

---

## 13. Privacy & security (local-first)

Capturing a resume (PII), voice (biometric-ish), and camera — handled respectfully, which is
itself a differentiator.

- **Camera never leaves the device.** MediaPipe runs in-renderer; only derived stats
  ("looked away 60% of the time") are ever persisted. State this loudly.
- **Everything is local by default.** Transcripts/reports live in the local SQLite DB; the
  only outbound traffic is to the AI vendors the user configured.
- **Audio recording is opt-in**, transcript-only by default, with one-click delete and a full
  **export / wipe-all** in Settings.
- **API keys in the OS keychain** via `safeStorage`, never in the DB, never shown back.
- Short, honest privacy note in-app and in the README.

---

## 14. Provider adapters (interfaces)

Every vendor sits behind a small streaming interface in `shared/adapters`. Three concrete
impls each: **real**, **mock** (deterministic, for tests), **replay** (plays recorded
fixtures; powers demo mode).

```ts
interface SttAdapter {            // streaming speech-to-text
  start(opts): SttSession;        // push PCM frames, get partials + finals (with word ts)
}
interface LlmAdapter {            // streaming chat with structured-output mode
  stream(messages, opts): AsyncIterable<Token>;
  json<T>(messages, schema): Promise<T>;   // for the feedback engine
}
interface TtsAdapter {            // streaming text-to-speech
  synthesize(textChunk, voiceId): AsyncIterable<AudioFrame>;
}
```

Adapters never import Electron — they're pure Node so they unit-test trivially.

---

## 15. Testing strategy

You can't unit-test "feels good," but you can test almost everything else — a real suite is a
major "can work on a team" signal.

- **Adapter mock + replay:** record real responses once (audio, STT, LLM completions), replay
  deterministically in tests. Free, fast, repeatable.
- **State machine:** fully deterministic — phase transitions, time budgets, exit conditions,
  digression handling.
- **Clause chunker:** boundary/min-length cases (a pure function — perfect first test).
- **Barge-in truncation:** explicit test that stored assistant message == only the played
  portion after an interrupt.
- **Context manager:** token budget stays bounded as turns accumulate; summaries produced
  correctly; recent turns kept verbatim.
- **Feedback engine:** fixed transcript fixtures with known expected rubric outcomes; assert
  structured output validates and judgments cite real spans.
- **IPC contracts:** every Zod schema round-trips; preload rejects malformed payloads.
- **Integration:** scripted end-to-end "interview" using mock adapters → asserts a valid report.
- **E2E (Playwright `_electron`):** launch the packaged app, run a demo-mode session, assert UI.
- **Latency:** automated time-to-first-audio against mocked-but-realistic provider delays;
  tracked in the dashboard and asserted in CI (regression guard).

Coverage gate in CI on the **core** (controller, chunker, context, eval) — not on UI glue.

---

## 16. Build, packaging & distribution

- **electron-vite** builds main/preload/renderer; **electron-builder** packages
  `.dmg`/`.AppImage`+`.deb`/`.exe (NSIS)`.
- **Native modules:** `better-sqlite3` is rebuilt for Electron's ABI in CI
  (`electron-builder install-app-deps`); pin Node/Electron versions (`.nvmrc`, engines).
- **Auto-update:** `electron-updater` against **GitHub Releases**; staged rollout optional.
- **Signing:** document macOS notarization + Windows signing; ship unsigned dev builds with a
  clear note (signing certs are a money/identity step, fine to defer for a portfolio piece, but
  the pipeline is wired so enabling it is a config + secret away).

---

## 17. CI/CD pipeline

GitHub Actions, fast feedback first, packaging last:

1. **`ci.yml` (every push/PR):** install (cached) → typecheck → lint → format-check → unit +
   integration tests (Vitest) → coverage gate on core → `electron-vite build` (proves the app
   compiles on Linux). Fast.
2. **`e2e.yml`:** Playwright `_electron` smoke (demo-mode session → report) on Linux (xvfb).
3. **`release.yml` (tags `v*`):** matrix **macOS/Windows/Linux** → `electron-builder` →
   upload installers + `latest.yml` to a GitHub Release (feeds auto-update). Signing secrets
   wired but optional.
4. **Housekeeping:** Dependabot, `npm audit`, CodeQL (optional).

Branch protection on `main`: CI green required. Conventional Commits for a readable history.

---

## 18. Project structure

```
interview-cracker/
├─ docs/plan/THE_INTERVIEW_IMPLEMENTATION_PLAN.md   ← this file
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ package.json  tsconfig*.json  .nvmrc
├─ .github/workflows/{ci,e2e,release}.yml
├─ src/
│  ├─ main/                  # Electron main: window, menu, updater, keychain, db wiring
│  │  ├─ index.ts
│  │  ├─ ipc/                # typed handlers (session, settings, report, keys)
│  │  └─ db/                 # drizzle schema + migrations + client
│  ├─ preload/index.ts       # contextBridge: the only renderer-facing API
│  ├─ renderer/              # React app
│  │  ├─ index.html
│  │  └─ src/{app,components,features,audio,lib,store,styles}/
│  ├─ orchestrator/          # the realtime engine (pure-ish Node, no Electron imports)
│  │  ├─ controller/         # state machine, context manager, scratchpad
│  │  ├─ chunker/            # clause chunker
│  │  ├─ endpointing/        # VAD/endpointing arbiter
│  │  └─ eval/               # feedback engine
│  └─ shared/                # channel names, Zod schemas, types, adapter interfaces
└─ test/                     # vitest unit/integration + playwright e2e + fixtures
```

The `orchestrator/`, `eval/`, and `shared/` code imports **no Electron** — pure TypeScript,
trivially unit-testable, and portable if you ever do want a server build.

---

## 19. Milestones

Ordering principle: **de-risk the hardest, most uncertain thing first**, and build the
conversation intelligence in cheap text before adding real-time voice. Each milestone has an
**exit criterion** — don't move on until it's met.

### M0 — Spike, shell & foundations
- Electron + electron-vite + React + TS app boots; hardened renderer (§8); CI green (lint +
  typecheck + test + build); Drizzle + SQLite wired; design tokens + 2–3 base components.
- Throwaway spike: mic → STT → LLM → TTS → speaker over MessagePort, measuring
  time-to-first-audio; **latency dashboard** stub.
- **Exit:** the app window opens, you can speak to the spike and hear a reply, and you've
  measured real latency against chosen vendors. Decision recorded on whether latency is workable.

### M1 — Text-only interview (the brain)
- Interview plan state machine, rolling context + summarization, interviewer scratchpad. Type
  answers; the AI conducts a coherent, phase-structured interview. ⚠️ Most people skip to voice
  and regret it.
- **Exit:** a 30+ minute typed interview stays coherent, on-plan, and references **specific**
  earlier answers.

### M1.5 — Basic feedback report
- Lite rubric scoring + summary from the transcript (the real product, pulled forward).
- **Exit:** ending a text session produces a structured, transcript-grounded report.

### M2 — Voice layer (push-to-talk)
- Streaming STT + TTS + audio I/O with the simplest turn model: **hold-to-talk** (no
  endpointing yet). Clause chunker → early TTS. Speaking-indicator UI + live captions.
- **Exit:** hold-to-talk through a full voice interview end to end.

### M3 — Turn-taking & barge-in (the centerpiece)
- Extract Orchestrator to a `utilityProcess`. VAD + endpointing (thinking-pause grace window),
  barge-in with correct truncation, echo handling (headphones first, then test speaker case).
- **Exit:** natural back-and-forth without push-to-talk; you can interrupt; it doesn't cut you
  off when you pause to think; barge-in truncation is provably correct.

### M4 — Session setup & persistence
- Resume + JD ingestion, config (role/level/duration/type/model), full SQLite persistence,
  session-history UI, resume-after-crash.
- **Exit:** sessions are configurable, saved, listable, and survive an orchestrator/app restart.

### M5 — Full feedback engine
- Complete rubric scoring, filler/pace stats, annotated transcript with **rewrites**,
  cross-session progress charts.
- **Exit:** the report is something a real user would find genuinely useful and honest.

### M6 — Camera presence feedback (coaching, not surveillance) *(stretch)*
- MediaPipe gaze/head-pose/presence in-renderer → coaching ("eye contact dropped during hard
  questions; that reads as low confidence").
- **Exit:** camera stats appear in the report, computed entirely client-side.

### M7 — Character personas *(stretch)*
- Persona config system (personality, speaking style, voice ID, difficulty). ⚠️ **IP — read
  §20**: ship **original parody personas** in the public repo.
- **Exit:** selectable personas with distinct voices/behavior on clean config data.

### M8 — Visual presence *(stretch)*
- Static portrait + speaking indicator first; escalate to animation only if time/appetite
  remain. ⚠️ Do not let the avatar become the project.
- **Exit:** whatever ships here is polished and optional.

### M9 — Polish, onboarding, packaging, ship
- Onboarding, empty/error states, demo mode, README (architecture + tradeoffs + the
  rejected-WebRTC note + walkthrough GIF), packaged installers + auto-update, latency dashboard
  with real numbers.
- **Exit:** a stranger downloads an installer, runs a full demo-mode interview with no keys,
  and understands the repo in 2 minutes.

**Real scope (the deliverable): M0–M5 + M9.** M6/M7/M8 are bonus rounds taken only if the core
ships clean. A polished M0–M5 desktop app beats a 70%-done one with an unfinished avatar.

---

## 20. Character personas — IP note

A persona is a system-prompt personality + a mapped TTS voice. Build it as a clean, reusable
**persona config system** — that's the impressive, reusable part. The risk is *which*
characters appear in a **public** repo:

- **Copyrighted characters** (Homer, Rick, etc.) — impersonation, especially with a cloned
  voice, is IP infringement.
- **Real living people** — voice-cloning triggers right-of-publicity/deepfake concerns and most
  TTS ToS **forbid** cloning real people without consent.

**The move:** ship **original parody personas** that evoke a vibe — "a chaotic dimension-hopping
genius who insults your architecture," "a blustery reality-TV exec who fires you mid-answer,"
"an overconfident bro-grammer who only respects Rust." Same system, zero liability, arguably
funnier because it's yours. Because personas are just config data, anyone running it locally can
define whatever they like — the honest way to leave that door open.

---

## 21. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Latency feels dead | Med | High | M0 spike first; stream all stages; early TTS; MessagePort (no net hop) |
| Turn-taking feels bad | High | High | Dedicated M3; tunable endpointing; real testing |
| Echo / AI hears itself | High | Med | Headphones for MVP; explicit speaker-case test |
| Barge-in truncation rots coherence | Med | High | `played-through` accounting; explicit test |
| Feedback hallucinates | Med | High | Quoted spans; explicit rubric; structured+validated output |
| Native module / packaging pain | Med | Med | Pin versions; `install-app-deps` in CI; matrix release |
| Electron security misconfig | Med | High | Sandbox+contextIsolation+CSP from day one; keys in keychain only |
| Avatar eats the timeline | High | Med | M8/stretch; static portrait is fine |
| Scope creep | High | High | Exit criteria per milestone; M0–M5+M9 is the real scope; depth over breadth |

---

## 22. Open decisions to resolve

- **Vendors (STT/LLM/TTS):** choose at M0 after the latency spike. **VERIFY** current best.
- **Electron version line:** pin at M0; track LTS-ish stable.
- **Orchestrator location:** in main for M0–M2, extract to `utilityProcess` at M3 (interfaces
  make this mechanical).
- **Audio recording default:** transcript-only vs opt-in audio (lean transcript-only).
- **Code signing:** wire the pipeline now; decide whether to buy certs before public release.

---

## 23. Definition of done (portfolio bar)

- Ships to **100%**: every milestone in the real scope met, no half-features dangling.
- Real test suite (unit + integration + an E2E smoke), green CI, coverage gate on core.
- Packaged installers for mac/win/linux, auto-update wired, demo mode that needs **no keys and
  no cost**.
- README explains the **architecture and the tradeoffs made and rejected** (Electron vs
  browser, MessagePort vs WebRTC, pipeline vs speech-to-speech), with a recorded walkthrough.
- Latency dashboard shows real numbers.
- Privacy handled and stated honestly; keys in the OS keychain.
- The feedback report is something *you yourself* would use before a real interview.
