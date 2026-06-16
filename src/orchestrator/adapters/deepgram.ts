/**
 * Real streaming STT backed by Deepgram. The vendor connection is abstracted behind a small
 * normalized interface so the adapter logic is fully unit-testable without a socket or key.
 *
 * Audio arrives as webm/opus chunks (from the renderer's MediaRecorder) and is forwarded to the
 * live connection; on `end()` we ask Deepgram to finalize and resolve with the accumulated
 * final transcript.
 */
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import type { SttAdapter, SttResult, SttSession } from '../../shared/adapters'

/** Normalized Deepgram live connection — the real impl maps the SDK's events onto this. */
export interface DgConnection {
  on(event: 'transcript', cb: (text: string, isFinal: boolean) => void): void
  on(event: 'close', cb: () => void): void
  on(event: 'error', cb: (err: unknown) => void): void
  send(chunk: ArrayBufferView | ArrayBuffer): void
  finish(): void
}

export interface DeepgramAdapterOptions {
  apiKey?: string
  model?: string
  /** Inject a connection factory (tests); otherwise a real Deepgram connection is opened. */
  createConnection?: (opts: { model: string }) => DgConnection
}

const FINALIZE_TIMEOUT_MS = 1500

export class DeepgramSttAdapter implements SttAdapter {
  private readonly model: string
  private readonly factory: (opts: { model: string }) => DgConnection

  constructor(opts: DeepgramAdapterOptions = {}) {
    this.model = opts.model ?? 'nova-2'
    this.factory = opts.createConnection ?? makeRealConnection(opts.apiKey ?? '')
  }

  start(): SttSession {
    const conn = this.factory({ model: this.model })
    let finalText = ''
    let resolveEnd: ((r: SttResult) => void) | null = null

    const settle = (): void => {
      if (resolveEnd) {
        resolveEnd({ text: finalText.trim(), isFinal: true })
        resolveEnd = null
      }
    }

    conn.on('transcript', (text, isFinal) => {
      if (text && isFinal) finalText += (finalText ? ' ' : '') + text
    })
    conn.on('close', settle)
    conn.on('error', settle)

    return {
      pushAudio: (chunk) => conn.send(chunk),
      end: () =>
        new Promise<SttResult>((resolve) => {
          resolveEnd = resolve
          conn.finish()
          // Safety net if the vendor never sends a close.
          setTimeout(settle, FINALIZE_TIMEOUT_MS)
        }),
      // eslint-disable-next-line require-yield
      results: async function* () {
        return
      },
      close: () => conn.finish()
    }
  }
}

/**
 * Builds the real Deepgram connection. Tests inject `createConnection` instead, so the real
 * client is never constructed off the test path.
 */
function makeRealConnection(apiKey: string): (opts: { model: string }) => DgConnection {
  return ({ model }) => {
    const live = createClient(apiKey).listen.live({
      model,
      smart_format: true,
      interim_results: true,
      punctuate: true
    })

    return {
      on(event: string, cb: (...args: any[]) => void) {
        if (event === 'transcript') {
          live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
            const alt = data?.channel?.alternatives?.[0]
            cb(alt?.transcript ?? '', Boolean(data?.is_final))
          })
        } else if (event === 'close') {
          live.on(LiveTranscriptionEvents.Close, () => cb())
        } else if (event === 'error') {
          live.on(LiveTranscriptionEvents.Error, (err: unknown) => cb(err))
        }
      },
      send(chunk: ArrayBufferView | ArrayBuffer) {
        live.send(chunk as ArrayBuffer)
      },
      finish() {
        // v3 uses requestClose(); fall back to finish() on older shapes.
        const anyLive = live as unknown as { requestClose?: () => void; finish?: () => void }
        ;(anyLive.requestClose ?? anyLive.finish)?.call(live)
      }
    } as DgConnection
  }
}
