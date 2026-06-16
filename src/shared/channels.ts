/**
 * Canonical IPC channel names. Both the preload bridge and the main-process handlers import
 * from here so the two sides can never drift.
 */
export const Channels = {
  system: {
    getAppInfo: 'system:getAppInfo'
  },
  session: {
    start: 'session:start',
    stop: 'session:stop',
    /** main → renderer stream of session events (see SessionEventSchema). */
    event: 'session:event'
  },
  audio: {
    /** renderer → main: user pressed push-to-talk. */
    turnStart: 'audio:turnStart',
    /** renderer → main: a chunk of captured audio (ArrayBuffer). */
    chunk: 'audio:chunk',
    /** renderer → main: user released push-to-talk; finalize the turn. */
    turnEnd: 'audio:turnEnd'
  },
  keys: {
    status: 'keys:status',
    save: 'keys:save',
    clear: 'keys:clear'
  }
} as const
