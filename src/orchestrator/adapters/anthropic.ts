/**
 * Real LLM adapter backed by the Anthropic SDK (Claude).
 *
 * Design choices for the *live* interviewer turn (see the claude-api skill + the plan §4):
 *  - Streaming, so the clause chunker can start TTS on the first sentence.
 *  - `thinking: disabled` — thinking adds latency before the first token, and a spoken
 *    interviewer reply is latency-critical dialogue, not a heavy reasoning task. (The feedback
 *    engine, M5, is the complicated task and will use adaptive thinking + structured outputs.)
 *  - The persona/system block is marked `cache_control: ephemeral` so it caches once it's large
 *    enough to clear the model's minimum cacheable prefix.
 *  - Default model is `claude-opus-4-8`; callers may override per session (e.g. Sonnet for lower
 *    latency).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, LlmAdapter } from '../../shared/adapters'

export const DEFAULT_MODEL = 'claude-opus-4-8'

/** Minimal structural shape so tests can inject a fake client without the real SDK/network. */
export interface AnthropicLike {
  messages: {
    stream(args: unknown): AsyncIterable<unknown>
    create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

export interface AnthropicAdapterOptions {
  apiKey?: string
  model?: string
  /** Inject a client (tests); otherwise a real Anthropic client is created. */
  client?: AnthropicLike
}

interface SplitMessages {
  system?: string
  turns: Array<{ role: 'user' | 'assistant'; content: string }>
}

/** Pull `system` messages out into the top-level system param; keep the user/assistant turns. */
export function splitMessages(messages: ChatMessage[]): SplitMessages {
  const systemParts: string[] = []
  const turns: SplitMessages['turns'] = []
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content)
    else turns.push({ role: m.role, content: m.content })
  }
  return { system: systemParts.length ? systemParts.join('\n\n') : undefined, turns }
}

export class AnthropicLlmAdapter implements LlmAdapter {
  private readonly client: AnthropicLike
  private readonly model: string

  constructor(opts: AnthropicAdapterOptions = {}) {
    this.client =
      opts.client ?? (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike)
    this.model = opts.model ?? DEFAULT_MODEL
  }

  async *stream(messages: ChatMessage[], opts?: { model?: string }): AsyncIterable<string> {
    const { system, turns } = splitMessages(messages)
    const stream = this.client.messages.stream({
      model: opts?.model ?? this.model,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: system
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : undefined,
      messages: turns
    })

    for await (const event of stream as AsyncIterable<{
      type?: string
      delta?: { type?: string; text?: string }
    }>) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text ?? ''
      }
    }
  }

  async json<T>(messages: ChatMessage[], opts?: { model?: string }): Promise<T> {
    const { system, turns } = splitMessages(messages)
    // The feedback engine is the complicated, correctness-sensitive task → adaptive thinking.
    // (M5 will tighten this with output_config.format for guaranteed-valid JSON.)
    const message = await this.client.messages.create({
      model: opts?.model ?? this.model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system,
      messages: turns
    })
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    return JSON.parse(text) as T
  }
}
