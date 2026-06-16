import { z } from 'zod'

/**
 * Every IPC payload is validated against a Zod schema at the boundary. Start small;
 * this grows one channel at a time as milestones land.
 */
export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  electron: z.string(),
  node: z.string()
})

export type AppInfo = z.infer<typeof AppInfoSchema>
