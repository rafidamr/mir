import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { callAiSdk } from '../src/router/llm-clients.ts'
import type { ModelEvent } from '../src/router/types.ts'

const prompt = { instructions: 'You are a support assistant.', message: 'Cancel my order' }

/** A fake AI SDK model that sends these messages, the way a provider would. */
function providerSends(parts: LanguageModelV4StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: convertArrayToReadableStream(parts) }),
  })
}

async function collect(events: AsyncIterable<ModelEvent>): Promise<ModelEvent[]> {
  const all: ModelEvent[] = []
  for await (const event of events) all.push(event)
  return all
}

describe('callAiSdk', () => {
  it('passes on the text and the token counts, including hidden thinking tokens', async () => {
    const model = providerSends([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Sure, ' },
      { type: 'text-delta', id: '1', delta: 'I can help.' },
      { type: 'text-end', id: '1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 80, text: 30, reasoning: 50 },
        },
      },
    ])
    const events = await collect(callAiSdk(model)(prompt, new AbortController().signal))

    expect(events).toEqual([
      { type: 'text', text: 'Sure, ' },
      { type: 'text', text: 'I can help.' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, reasoningTokens: 50 },
    ])
  })

  it('treats a provider error that arrives after a successful start as a failure', async () => {
    const model = providerSends([
      { type: 'stream-start', warnings: [] },
      { type: 'error', error: new Error('Provider returned error: rate limit exceeded') },
    ])

    await expect(collect(callAiSdk(model)(prompt, new AbortController().signal))).rejects.toThrow(
      'rate limit exceeded',
    )
  })
})
