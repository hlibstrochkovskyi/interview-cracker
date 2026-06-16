import { describe, it, expect } from 'vitest'
import {
  AnthropicLlmAdapter,
  splitMessages,
  type AnthropicLike
} from '@orchestrator/adapters/anthropic'
import type { ChatMessage } from '@shared/adapters'

function fakeClient(tokens: string[]): { client: AnthropicLike; captured: () => any } {
  let captured: any
  const client: AnthropicLike = {
    messages: {
      stream: (args: unknown) => {
        captured = args
        return (async function* () {
          for (const t of tokens) {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: t } }
          }
          yield { type: 'message_stop' }
        })()
      },
      create: async (args: unknown) => {
        captured = args
        return { content: [{ type: 'text', text: '{"score":7}' }] }
      }
    }
  }
  return { client, captured: () => captured }
}

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are an interviewer.' },
  { role: 'user', content: 'I led a migration.' },
  { role: 'assistant', content: 'Tell me more.' },
  { role: 'user', content: 'It was hard.' }
]

describe('splitMessages', () => {
  it('separates system messages from the user/assistant turns', () => {
    const { system, turns } = splitMessages(MESSAGES)
    expect(system).toBe('You are an interviewer.')
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user'])
  })
})

describe('AnthropicLlmAdapter', () => {
  it('streams text deltas and ignores non-text events', async () => {
    const { client } = fakeClient(['Walk ', 'me ', 'through ', 'it.'])
    const adapter = new AnthropicLlmAdapter({ client, model: 'claude-opus-4-8' })
    let out = ''
    for await (const tok of adapter.stream(MESSAGES)) out += tok
    expect(out).toBe('Walk me through it.')
  })

  it('sends the persona as a cache-controlled system block and disables thinking', async () => {
    const { client, captured } = fakeClient(['hi'])
    const adapter = new AnthropicLlmAdapter({ client })
    for await (const _ of adapter.stream(MESSAGES)) void _
    const args = captured()
    expect(args.system[0]).toMatchObject({
      type: 'text',
      text: 'You are an interviewer.',
      cache_control: { type: 'ephemeral' }
    })
    expect(args.thinking).toEqual({ type: 'disabled' })
    expect(args.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('parses structured JSON output for the feedback engine', async () => {
    const { client } = fakeClient([])
    const adapter = new AnthropicLlmAdapter({ client })
    const result = await adapter.json<{ score: number }>(MESSAGES)
    expect(result).toEqual({ score: 7 })
  })
})
