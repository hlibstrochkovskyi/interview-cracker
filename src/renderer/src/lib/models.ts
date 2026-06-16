/** The Claude models the user can pick for real sessions. */
export const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'Fastest · cheapest' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'Balanced' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'Sharpest · priciest' }
] as const

export type ModelId = (typeof MODELS)[number]['id']

/** Balanced default — much cheaper than Opus, plenty sharp for an interviewer. */
export const DEFAULT_MODEL_ID: ModelId = 'claude-sonnet-4-6'

export const modelLabel = (id: string): string => MODELS.find((m) => m.id === id)?.label ?? 'Claude'
