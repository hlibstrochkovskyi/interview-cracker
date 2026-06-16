/**
 * Streaming clause chunker.
 *
 * To start TTS early (and keep time-to-first-audio low), we split the LLM's streaming output
 * at sentence/clause boundaries and forward each chunk to TTS the moment it completes — rather
 * than waiting for the whole response. A min-length floor prevents synthesizing tiny fragments
 * ("So.", "Right,"): if a boundary lands before the floor, we keep accumulating to the next
 * boundary and emit the longer chunk. A decimal guard avoids splitting numbers like "3.5".
 */
export interface ClauseChunkerOptions {
  /** Minimum trimmed length (chars) a chunk must reach before it may be emitted. */
  minLength?: number
}

const BOUNDARY = new Set(['.', '!', '?', ';', ','])

export class ClauseChunker {
  private buffer = ''
  private readonly minLength: number

  constructor(opts: ClauseChunkerOptions = {}) {
    this.minLength = opts.minLength ?? 16
  }

  /** Feed a token (or any string slice). Returns zero or more completed clauses. */
  push(token: string): string[] {
    this.buffer += token
    const out: string[] = []

    let idx = this.nextEmittableBoundary(this.buffer)
    while (idx !== -1) {
      out.push(this.buffer.slice(0, idx + 1).trim())
      this.buffer = this.buffer.slice(idx + 1)
      idx = this.nextEmittableBoundary(this.buffer)
    }
    return out
  }

  /** Emit whatever remains (call once the LLM stream is complete). */
  flush(): string | null {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest.length > 0 ? rest : null
  }

  /**
   * Index of the first boundary char whose prefix (trimmed) reaches the min-length floor,
   * skipping boundaries that are too early and decimal points inside numbers. -1 if none yet.
   */
  private nextEmittableBoundary(s: string): number {
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (!BOUNDARY.has(c)) continue
      if (c === '.') {
        const prev = s[i - 1]
        const next = s[i + 1]
        // Don't split decimals / version numbers ("3.5", "v1.2").
        if (prev && next && /\d/.test(prev) && /\d/.test(next)) continue
      }
      if (s.slice(0, i + 1).trim().length >= this.minLength) return i
    }
    return -1
  }
}
