import { describe, it, expect } from 'vitest'
import { DeepgramSttAdapter, type DgConnection } from '@orchestrator/adapters/deepgram'

/** A controllable fake Deepgram connection. */
function fakeConn() {
  const handlers: Record<string, (...args: any[]) => void> = {}
  const sent: Array<ArrayBufferView | ArrayBuffer> = []
  let finished = false
  const conn: DgConnection = {
    on: (event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb
    },
    send: (chunk) => sent.push(chunk),
    finish: () => {
      finished = true
    }
  }
  return {
    conn,
    sent,
    emitTranscript: (text: string, isFinal: boolean) => handlers.transcript?.(text, isFinal),
    close: () => handlers.close?.(),
    isFinished: () => finished
  }
}

describe('DeepgramSttAdapter', () => {
  it('forwards audio chunks to the connection', () => {
    const f = fakeConn()
    const adapter = new DeepgramSttAdapter({ createConnection: () => f.conn })
    const session = adapter.start()
    session.pushAudio(new Uint8Array([1, 2, 3]))
    session.pushAudio(new Uint8Array([4]))
    expect(f.sent).toHaveLength(2)
  })

  it('accumulates only final transcripts and resolves on close', async () => {
    const f = fakeConn()
    const adapter = new DeepgramSttAdapter({ createConnection: () => f.conn })
    const session = adapter.start()

    const ended = session.end()
    expect(f.isFinished()).toBe(true) // end() asks the vendor to finalize

    f.emitTranscript('I led', false) // interim — ignored
    f.emitTranscript('I led a database', true)
    f.emitTranscript('migration last year.', true)
    f.close()

    const result = await ended
    expect(result.text).toBe('I led a database migration last year.')
    expect(result.isFinal).toBe(true)
  })

  it('still resolves if the vendor never closes (timeout safety net)', async () => {
    const f = fakeConn()
    const adapter = new DeepgramSttAdapter({ createConnection: () => f.conn })
    const session = adapter.start()
    f.emitTranscript('hello there', true)
    const result = await session.end() // no close() emitted — relies on the timeout
    expect(result.text).toBe('hello there')
  }, 3000)
})
