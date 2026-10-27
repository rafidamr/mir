import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAiSdk, createLLMClients } from '../src/router/llm-clients.ts'
import type { LLMClient, ModelEvent } from '../src/router/types.ts'

const prompt = { instructions: 'You are a support assistant.', message: 'Cancel my order' }

/** A short answer and its token counts: 80 output tokens, 50 of them hidden thinking. */
const shortAnswer: LanguageModelV4StreamPart[] = [
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
]

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
  it('passes on the text and the token counts, with hidden thinking counted as output', async () => {
    const model = providerSends(shortAnswer)
    const events = await collect(callAiSdk(model)(prompt, new AbortController().signal))

    expect(events).toEqual([
      { type: 'text', text: 'Sure, ' },
      { type: 'text', text: 'I can help.' },
      { type: 'usage', inputTokens: 120, outputTokens: 80 },
    ])
  })

  it('sends the vendor the 500-token cap on the answer', async () => {
    const model = providerSends(shortAnswer)
    await collect(callAiSdk(model)(prompt, new AbortController().signal))

    expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(500)
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

describe('createLLMClients', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function clients(openRouterTrainingAllowed = false) {
    const cost = { input: 0, output: 0 }
    return createLLMClients({
      DATABASE_URL: 'postgres://localhost/test',
      PORT: 8080,
      OPENROUTER_API_KEY: 'test',
      OPENROUTER_MODEL: {
        id: 'test/openrouter',
        training_allowed: openRouterTrainingAllowed,
        reasoning: 'low',
        cost,
      },
      GEMINI_API_KEY: 'test',
      GEMINI_MODEL: { id: 'gemini-3.5-flash-lite', training_allowed: true, reasoning: 'low', cost },
    })
  }

  /** Calls the model, catching its request on the way out and stopping it there. */
  async function requestSentBy(client: LLMClient | undefined) {
    if (!client) throw new Error('The client is missing')
    const sent: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return Response.json({ error: { message: 'stopped by the test' } }, { status: 400 })
    })
    await expect(collect(client.call(prompt, new AbortController().signal))).rejects.toThrow()
    return sent[0]
  }

  it('sends Gemini the thinking level from its settings', async () => {
    const gemini = clients().find((client) => client.id === 'gemini-3.5-flash-lite')
    expect(await requestSentBy(gemini)).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
    })
  })

  it.each([
    { trainingAllowed: false, provider: { sort: 'latency', data_collection: 'deny' } },
    { trainingAllowed: true, provider: { sort: 'latency' } },
  ])(
    'sends OpenRouter the thinking level and asks for the fastest provider, and for no-training providers only when needed (training allowed: $trainingAllowed)',
    async ({ trainingAllowed, provider }) => {
      const openRouter = clients(trainingAllowed).find((client) => client.id === 'test/openrouter')
      const sent = await requestSentBy(openRouter)
      expect(sent).toMatchObject({ reasoning: { effort: 'low' } })
      expect(sent?.provider).toEqual(provider)
    },
  )
})
