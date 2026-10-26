import { describe, expect, it } from 'vitest'
import { createLLMClients } from '../src/router/llm-clients.ts'
import { AllModelsFailedError, createRouter } from '../src/router/router.ts'
import type { LLMClient } from '../src/router/types.ts'

const request = {
  prompt: { instructions: 'You are a support assistant.', message: 'I want to cancel my order' },
  allowsTraining: true,
}
const answer = ['Sure, I can help you cancel ', 'your order. Open Orders and press Cancel.']

/** A fake model: sends these pieces of text, then finishes, fails, or waits until it's stopped. */
function fake(
  id: string,
  pieces: string[],
  end: 'finish' | 'hang' | Error = 'finish',
  extra: Partial<LLMClient> = {},
) {
  let calls = 0
  return {
    id,
    cost: { input: 0.3, output: 2.5, reasoning: 2.5 },
    trainingAllowed: false,
    get calls() {
      return calls
    },
    async *call(_prompt: unknown, signal: AbortSignal) {
      calls++
      for (const text of pieces) yield { type: 'text' as const, text }
      if (end === 'hang') {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('stopped'))),
        )
      }
      if (end instanceof Error) throw end
      yield { type: 'usage' as const, inputTokens: 1200, outputTokens: 150, reasoningTokens: 50 }
    },
    ...extra,
  }
}
const free = (pieces: string[], end?: 'finish' | 'hang' | Error) =>
  fake('free', pieces, end, {
    cost: { input: 0, output: 0, reasoning: 0 },
    trainingAllowed: true,
  })
const paid = (pieces: string[], end?: 'finish' | 'hang' | Error) => fake('paid', pieces, end)

async function readAll(text: AsyncIterable<string>): Promise<string> {
  let all = ''
  for await (const piece of text) all += piece
  return all
}

const isJunk = (words: string) => (/[a-z]{3}/i.test(words) ? null : 'looks like junk')

describe('router', () => {
  it('uses the first model when it answers', async () => {
    const backup = paid(answer)
    const routed = await createRouter({ llmClients: [free(answer), backup] }).route(request)
    expect(routed).toMatchObject({ model: 'free', fallbackReason: null })
    expect(await readAll(routed.text)).toBe(answer.join(''))
    expect(routed.usage()).toEqual({ inputTokens: 1200, outputTokens: 150, costUsd: 0 })
    expect(backup.calls).toBe(0)
  })

  it.each([
    ['errors', free([], new Error('rate limit exceeded')), 'free: rate limit exceeded'],
    ['is too slow to start', free([], 'hang'), 'free: too slow: no answer within 0.05 s'],
    [
      'starts with junk',
      free(['%$#@!&*^~ ;;;; ::::: ~~~~ ^^^^ ###### @@@@@']),
      'free: looks like junk',
    ],
    ['sends nothing', free([]), 'free: empty answer'],
  ])('switches to the next model when the first one %s', async (_, first, reason) => {
    const router = createRouter({ llmClients: [first, paid(answer)], firstWordsTimeoutMs: 50 })
    const routed = await router.route({ ...request, doSanityCheck: isJunk })
    expect(routed).toMatchObject({ model: 'paid', fallbackReason: reason })
    expect(await readAll(routed.text)).toBe(answer.join(''))
  })

  it('lets the last model start slowly, since there is nothing to switch to', async () => {
    const backup = paid(answer)
    const slowToStart: LLMClient = {
      ...backup,
      async *call(prompt, signal) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        yield* backup.call(prompt, signal)
      },
    }
    const router = createRouter({ llmClients: [slowToStart], firstWordsTimeoutMs: 50 })
    const routed = await router.route(request)
    expect(await readAll(routed.text)).toBe(answer.join(''))
  })

  it('lists every reason when no model can answer', async () => {
    const router = createRouter({
      llmClients: [free([], new Error('rate limit exceeded')), paid([], new Error('server error'))],
    })
    const failure = router.route(request)
    await expect(failure).rejects.toBeInstanceOf(AllModelsFailedError)
    await expect(failure).rejects.toThrow('free: rate limit exceeded; paid: server error')
  })

  it('skips a model that may train on data when the tenant does not allow training', async () => {
    const first = free(answer)
    const routed = await createRouter({ llmClients: [first, paid(answer)] }).route({
      ...request,
      allowsTraining: false,
    })
    expect(routed).toMatchObject({ model: 'paid', fallbackReason: null })
    expect(first.calls).toBe(0)
    await readAll(routed.text)
  })

  it('skips a model for 60 seconds after it fails 3 times in a row', async () => {
    let clock = 0
    const first = free([], new Error('rate limit exceeded'))
    const router = createRouter({ llmClients: [first, paid(answer)], now: () => clock })
    for (let i = 0; i < 3; i++) await readAll((await router.route(request)).text)

    const skipped = await router.route(request)
    expect(skipped.fallbackReason).toBe('free: skipped after 3 failures in a row')
    expect(first.calls).toBe(3)
    await readAll(skipped.text)

    clock += 60_000
    await readAll((await router.route(request)).text)
    expect(first.calls).toBe(4)
  })

  it('works out the cost from the tokens and the prices', async () => {
    const routed = await createRouter({ llmClients: [paid(answer)] }).route(request)
    await readAll(routed.text)
    // 1,200 × $0.30 + 100 answer tokens × $2.50 + 50 reasoning tokens × $2.50, per million.
    expect(routed.usage()).toEqual({ inputTokens: 1200, outputTokens: 150, costUsd: 0.000735 })
  })

  it('does not switch once the answer has started', async () => {
    const backup = paid(answer)
    const router = createRouter({
      llmClients: [
        free(['Sure, I can help you cancel your order. '], new Error('connection lost')),
        backup,
      ],
    })
    const routed = await router.route(request)
    expect(routed.model).toBe('free')
    await expect(readAll(routed.text)).rejects.toThrow('connection lost')
    expect(backup.calls).toBe(0)
  })

  it('stops an answer that runs past the total time limit', async () => {
    const router = createRouter({
      llmClients: [free(['Sure, I can help you cancel your order. '], 'hang')],
      totalTimeoutMs: 100,
    })
    const routed = await router.route(request)
    await expect(readAll(routed.text)).rejects.toThrow('stopped')
  })
})

describe('createModels', () => {
  it('puts the cheapest model first', () => {
    const setting = (id: string, price: number, trainingAllowed: boolean) => ({
      id,
      training_allowed: trainingAllowed,
      cost: { input: price, output: price, reasoning: price },
    })
    const models = createLLMClients({
      DATABASE_URL: 'postgres://localhost/x',
      PORT: 8080,
      OPENROUTER_API_KEY: 'test',
      OPENROUTER_MODEL: setting('pricey-openrouter-model', 9, false),
      GEMINI_API_KEY: 'test',
      GEMINI_MODEL: setting('cheap-gemini-model', 1, false),
    })
    expect(models.map((m) => m.id)).toEqual(['cheap-gemini-model', 'pricey-openrouter-model'])
  })
})
