import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDatabase } from '../src/db/client.ts'
import { requests } from '../src/db/schema.ts'
import { AllModelsFailedError } from '../src/router/router.ts'
import {
  addTenant,
  connectTestDatabase,
  fakeAssistant,
  readEvents,
  resetDatabase,
} from './helpers.ts'

const { sql, db } = connectTestDatabase()
afterAll(() => sql.end())
beforeEach(() => resetDatabase(db))

async function ask(
  app: ReturnType<typeof createApp>,
  apiKey: string | null,
  body: unknown,
): Promise<Response> {
  return app.request('/v1/assistant', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } }
  return body.error.code
}

describe('API key', () => {
  it('rejects a request without a key', async () => {
    const response = await ask(createApp({ db, assistant: fakeAssistant() }), null, {
      message: 'hi',
    })
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe('invalid_api_key')
  })

  it('rejects a wrong key', async () => {
    await addTenant(db)
    const response = await ask(createApp({ db, assistant: fakeAssistant() }), 'mir_wrong', {
      message: 'hi',
    })
    expect(response.status).toBe(401)
  })
})

describe('input', () => {
  it.each([
    ['a body that is not JSON', 'this is not json'],
    ['a missing message', {}],
    ['an empty message', { message: '   ' }],
    ['a message that is not text', { message: 42 }],
    ['a message over 200 characters', { message: 'a'.repeat(201) }],
  ])('rejects %s without calling the assistant', async (_, body) => {
    const { apiKey } = await addTenant(db)
    const assistant = fakeAssistant()
    const response = await ask(createApp({ db, assistant }), apiKey, body)
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('invalid_request')
    expect(assistant.calls).toBe(0)
  })
})

describe('quota', () => {
  it('refuses with 429 once the quota is used up, without calling the assistant', async () => {
    const { apiKey } = await addTenant(db, { requestQuota: 3 })
    const assistant = fakeAssistant()
    const app = createApp({ db, assistant })
    for (let i = 0; i < 3; i++) {
      expect((await ask(app, apiKey, { message: 'hi' })).status).toBe(200)
    }
    const response = await ask(app, apiKey, { message: 'hi' })
    expect(response.status).toBe(429)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toContain('3 of 3 requests used')
    expect(assistant.calls).toBe(3)
  })

  it('lets exactly 3 of 10 requests through when they arrive at once against a quota of 3', async () => {
    const { apiKey } = await addTenant(db, { requestQuota: 3 })
    const app = createApp({ db, assistant: fakeAssistant() })
    const statuses = await Promise.all(
      Array.from({ length: 10 }, () => ask(app, apiKey, { message: 'hi' }).then((r) => r.status)),
    )
    expect(statuses.filter((s) => s === 200)).toHaveLength(3)
    expect(statuses.filter((s) => s === 429)).toHaveLength(7)
  })

  it('refuses with 503 when the database cannot be reached (fail closed)', async () => {
    const unreachable = createDatabase('postgres://mir:mir@127.0.0.1:1/nowhere')
    const assistant = fakeAssistant()
    const response = await ask(createApp({ db: unreachable.db, assistant }), 'mir_anything', {
      message: 'hi',
    })
    await unreachable.sql.end()
    expect(response.status).toBe(503)
    expect(await errorCode(response)).toBe('database_unavailable')
    expect(assistant.calls).toBe(0)
  })
})

describe('streaming and recording', () => {
  it('streams details, then the answer, then done, and records the request', async () => {
    const { apiKey } = await addTenant(db)
    const response = await ask(createApp({ db, assistant: fakeAssistant() }), apiKey, {
      message: 'I want to cancel my order',
    })
    const events = await readEvents(response)
    expect(events.map((e) => e.event)).toEqual(['details', 'text', 'text', 'done'])
    const done = events.at(-1)?.data
    expect(done).toMatchObject({ outcome: 'answered', model: 'test-model', costUsd: 0.000536 })

    const [row] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, String(done?.id)))
    expect(row).toMatchObject({
      tenantId: 'tenant1',
      outcome: 'answered',
      model: 'test-model',
      fallbackReason: null,
      inputTokens: 620,
      outputTokens: 140,
      costUsd: 0.000536,
    })
    expect(row?.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('sends an error and records a failed request when no model can answer', async () => {
    const { apiKey } = await addTenant(db)
    const reason = 'No model could answer. free: rate limit exceeded; paid: server error'
    const assistant = fakeAssistant(() => Promise.reject(new AllModelsFailedError(reason)))
    const response = await ask(createApp({ db, assistant }), apiKey, { message: 'hi' })
    const events = await readEvents(response)
    expect(events.map((e) => e.event)).toEqual(['details', 'error', 'done'])
    expect(events[1]?.data).toEqual({ message: reason })
    expect(await db.select().from(requests)).toMatchObject([
      { outcome: 'failed', model: null, fallbackReason: reason, costUsd: 0 },
    ])
  })

  it('sends an error and records a failed request when the answer breaks off part-way', async () => {
    const { apiKey } = await addTenant(db)
    const assistant = fakeAssistant({
      text: (async function* () {
        yield 'You can cancel the order '
        throw new Error('connection lost')
      })(),
    })
    const response = await ask(createApp({ db, assistant }), apiKey, { message: 'hi' })
    const events = await readEvents(response)
    expect(events.map((e) => e.event)).toEqual(['details', 'text', 'error', 'done'])
    expect(await db.select().from(requests)).toMatchObject([
      { outcome: 'failed', model: 'test-model', inputTokens: 620 },
    ])
  })

  it('reports usage: quota, used, remaining, cost and recent requests', async () => {
    const { apiKey } = await addTenant(db, { requestQuota: 10 })
    const app = createApp({ db, assistant: fakeAssistant() })
    // Reading each stream to the end lets the request finish and be recorded.
    await (await ask(app, apiKey, { message: 'one' })).text()
    await (await ask(app, apiKey, { message: 'two' })).text()
    const response = await app.request('/v1/usage', {
      headers: { authorization: `Bearer ${apiKey}` },
    })
    const usage = (await response.json()) as { recent: unknown[] }
    expect(usage).toMatchObject({ quota: 10, used: 2, remaining: 8, totalCostUsd: 0.001072 })
    expect(usage.recent).toHaveLength(2)
  })
})
