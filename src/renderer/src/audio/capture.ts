/**
 * Push-to-talk microphone capture. Uses MediaRecorder (webm/opus) rather than raw PCM — the
 * STT vendor decodes the container directly, and it avoids the AudioWorklet bundling complexity.
 * Chunks are handed to `onChunk` (~4×/sec) to be forwarded to the main process over IPC.
 */
let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

/** Returns the shared mic stream, requesting permission on first use. */
export async function ensureMicStream(): Promise<MediaStream> {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    })
  }
  return stream
}

export async function startCapture(onChunk: (buf: Uint8Array) => void): Promise<void> {
  const s = await ensureMicStream()
  const mimeType = pickMimeType()
  recorder = mimeType ? new MediaRecorder(s, { mimeType }) : new MediaRecorder(s)
  recorder.ondataavailable = async (e) => {
    if (e.data && e.data.size > 0) onChunk(new Uint8Array(await e.data.arrayBuffer()))
  }
  recorder.start(250) // emit a chunk every 250ms
}

export function stopCapture(): Promise<void> {
  return new Promise((resolve) => {
    const r = recorder
    recorder = null
    if (!r || r.state === 'inactive') {
      resolve()
      return
    }
    r.onstop = () => resolve()
    r.stop()
  })
}

export function releaseMic(): void {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  recorder = null
}
