import { useEffect, useRef, useState } from 'react'

interface MicLevel {
  level: number // 0..1 RMS
  error?: string
}

/**
 * Captures the mic and reports a smoothed input level via an AnalyserNode. This exercises the
 * real getUserMedia path and gives the live "you're being heard" meter. (Raw PCM capture for
 * STT is an AudioWorklet, added at M2 when we stream audio to a real provider.)
 */
export function useMicLevel(active: boolean): MicLevel {
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | undefined>()
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      setLevel(0)
      return
    }

    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let cancelled = false

    const run = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) return
        context = new AudioContext()
        const source = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        const buffer = new Uint8Array(analyser.fftSize)

        const tick = (): void => {
          analyser.getByteTimeDomainData(buffer)
          let sumSquares = 0
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128
            sumSquares += v * v
          }
          const rms = Math.sqrt(sumSquares / buffer.length)
          setLevel((prev) => prev * 0.7 + rms * 0.3) // smoothing
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone unavailable')
      }
    }

    void run()

    return () => {
      cancelled = true
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach((t) => t.stop())
      void context?.close()
    }
  }, [active])

  return { level, error }
}
