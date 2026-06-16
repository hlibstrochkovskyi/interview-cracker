/**
 * Canonical IPC channel names. Both the preload bridge and the main-process handlers
 * import from here so the two sides can never drift.
 */
export const Channels = {
  system: {
    getAppInfo: 'system:getAppInfo'
  }
} as const

export type ChannelName = (typeof Channels)['system'][keyof (typeof Channels)['system']]
