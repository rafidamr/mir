import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Assistant, AssistantReply } from './assistant/types.ts'
import type { Database } from './db/client.ts'
import { findTenantByKey, recordRequest, usageFor, useOneRequest } from './db/queries.ts'
import type { NewRequest, Tenant } from './db/schema.ts'
import { ApiError } from './http/errors.ts'

const AssistantRequest = z.object({
  message: z
    .string({ error: 'message is required and must be text' })
    .trim()
    .min(1, 'message must not be empty')
    .max(2000, 'message must be at most 2,000 characters'),
})

export interface AppDependencies {
  db: Database
  assistant: Assistant
}

export function createApp({ db, assistant }: AppDependencies) {
  const app = new Hono<{ Variables: { tenant: Tenant } }>()

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    }
    console.error(error)
    return c.json(
      { error: { code: 'internal_error', message: 'Something went wrong on our side.' } },
      500,
    )
  })
  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'There is no such endpoint.' } }, 404),
  )

  // Every /v1 endpoint needs a valid API key.
  app.use('/v1/*', async (c, next) => {
    const apiKey = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!apiKey) {
      throw new ApiError(
        401,
        'invalid_api_key',
        'Send your API key in the header "Authorization: Bearer <key>".',
      )
    }
    const tenant = await databaseStep(() => findTenantByKey(db, apiKey))
    if (!tenant) throw new ApiError(401, 'invalid_api_key', 'This API key is not valid.')
    c.set('tenant', tenant)
    await next()
  })

  app.post('/v1/assistant', async (c) => {
    const started = performance.now()
    const body: unknown = await c.req.json().catch(() => {
      throw new ApiError(
        400,
        'invalid_request',
        'The request body must be JSON, like {"message": "..."}.',
      )
    })
    const input = AssistantRequest.safeParse(body)
    if (!input.success) {
      throw new ApiError(400, 'invalid_request', input.error.issues[0]?.message ?? 'Bad request.')
    }
    const tenant = c.var.tenant

    const quota = await databaseStep(() => useOneRequest(db, tenant.id))
    if (!quota.ok) {
      throw new ApiError(
        429,
        'quota_exceeded',
        `Request quota used up: ${quota.used} of ${quota.quota} requests used.`,
      )
    }

    const id = randomUUID()
    const latencyMs = () => Math.round(performance.now() - started)
    let reply: AssistantReply
    try {
      reply = await assistant.reply(input.data.message, tenant)
    } catch (error) {
      await record({ id, tenantId: tenant.id, outcome: 'failed', latencyMs: latencyMs() })
      throw error
    }
    const { answer, ...measured } = reply
    const row = { id, tenantId: tenant.id, ...measured, latencyMs: latencyMs() }
    await record(row)
    return c.json({ ...row, answer })
  })

  app.get('/v1/usage', async (c) => c.json(await databaseStep(() => usageFor(db, c.var.tenant.id))))

  /**
   * Saves the request's record. A failure here is logged, not sent to the caller: the answer
   * already exists and the quota has already been counted.
   */
  async function record(row: NewRequest): Promise<void> {
    try {
      await recordRequest(db, row)
    } catch (error) {
      console.error(`Could not record request ${row.id}:`, error)
    }
  }

  return app
}

/** Runs a database step. If the database can't be reached, the request is refused (fail closed). */
async function databaseStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step()
  } catch (error) {
    console.error('Database step failed:', error)
    throw new ApiError(
      503,
      'database_unavailable',
      'The database could not be reached, so the request was refused. Please try again shortly.',
    )
  }
}
