import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createAssistant } from '../src/assistant/assistant.ts'
import { requests } from '../src/db/schema.ts'
import { createRouter } from '../src/router/router.ts'
import type { LLMClient } from '../src/router/types.ts'
import { embedder, fakeModel, goodAnswer, kb } from './fakes.ts'
import { addTenant, connectTestDatabase, readEvents, resetDatabase } from './helpers.ts'

// The real gateway (front door, assistant and router) with fake models, a tiny knowledge base and
// the test database.

const { sql, db } = connectTestDatabase()
afterAll(() => sql.end())
beforeEach(() => resetDatabase(db))

function gateway(models: LLMClient[]) {
  const router = createRouter({ llmClients: models, firstWordsTimeoutMs: 50 })
  return createApp({ db, assistant: createAssistant({ kb, embedder, router }) })
}

async function ask(app: ReturnType<typeof gateway>, apiKey: string): Promise<Response> {
  return app.request('/v1/assistant', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'I want to cancel my order' }),
  })
}

/** Waits until the check passes, for things that finish after the response has been read. */
async function until(check: () => Promise<boolean>): Promise<void> {
  const giveUpAt = Date.now() + 2000
  while (!(await check())) {
    if (Date.now() > giveUpAt) throw new Error('Gave up waiting')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('the whole gateway', () => {
  it('switches to the next model when the first is too slow, and records why', async () => {
    const { apiKey } = await addTenant(db)
    const slow = fakeModel('free', [], { end: 'hang', trainingAllowed: true })
    const backup = fakeModel('paid', goodAnswer, {
      cost: { input: 0.3, output: 2.5 },
    })
    const events = await readEvents(await ask(gateway([slow, backup]), apiKey))

    expect(events.map((e) => e.event)).toEqual(['details', 'text', 'text', 'done'])
    const reason = 'free: too slow: no answer within 0.05 s'
    // 10 input tokens × $0.30 + 5 output tokens × $2.50, per million.
    const recorded = {
      outcome: 'answered',
      model: 'paid',
      fallbackReason: reason,
      costUsd: 0.0000155,
    }
    expect(events.at(-1)?.data).toMatchObject(recorded)
    expect(await db.select().from(requests)).toMatchObject([recorded])
  })

  it('sends an error and records a failed request with every reason when no model can answer', async () => {
    const { apiKey } = await addTenant(db)
    const models = [
      fakeModel('free', [], { end: new Error('rate limit exceeded'), trainingAllowed: true }),
      fakeModel('paid', [], { end: new Error('server error') }),
    ]
    const events = await readEvents(await ask(gateway(models), apiKey))

    expect(events.map((e) => e.event)).toEqual(['details', 'error', 'done'])
    const reason = 'No model could answer. free: rate limit exceeded; paid: server error'
    expect(events[1]?.data).toEqual({ message: reason })
    expect(await db.select().from(requests)).toMatchObject([
      { outcome: 'failed', model: null, fallbackReason: reason },
    ])
  })

  it('never sends a tenant that does not allow training to a model that may train on data', async () => {
    const { apiKey } = await addTenant(db, { allowsTraining: false })
    const free = fakeModel('free', goodAnswer, { trainingAllowed: true })
    const paid = fakeModel('paid', goodAnswer)
    const events = await readEvents(await ask(gateway([free, paid]), apiKey))

    expect(events.at(-1)?.data).toMatchObject({
      outcome: 'answered',
      model: 'paid',
      fallbackReason: null,
    })
    expect(free.prompts).toHaveLength(0)
  })

  it('stops the model and still records the request when the customer leaves mid-answer', async () => {
    const { apiKey } = await addTenant(db)
    const model = fakeModel('free', ['Sure, you can cancel it from the Orders page. '], {
      end: 'hang',
    })
    const response = await ask(gateway([model]), apiKey)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('The response has no body')

    // Read until the first piece of the answer arrives, then leave.
    const decoder = new TextDecoder()
    let received = ''
    while (!received.includes('event: text')) {
      received += decoder.decode((await reader.read()).value)
    }
    await reader.cancel()

    await until(async () => (await db.select().from(requests)).length === 1)
    expect(model.signals[0]?.aborted).toBe(true)
    expect(await db.select().from(requests)).toMatchObject([{ outcome: 'failed', model: 'free' }])
  })
})
