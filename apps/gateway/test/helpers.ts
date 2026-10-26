import path from 'node:path'
import { sql } from 'drizzle-orm'
import type { Answer, Assistant, Details } from '../src/assistant/assistant.ts'
import { createDatabase, type Database } from '../src/db/client.ts'
import { tenants } from '../src/db/schema.ts'
import { generateApiKey, hashApiKey } from '../src/lib/api-keys.ts'

export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://mir:mir@localhost:5433/mir_test'
export const migrationsFolder = path.join(import.meta.dirname, '..', 'drizzle')

export function connectTestDatabase() {
  return createDatabase(testDatabaseUrl)
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`truncate requests, tenants`)
}

/** Adds a tenant and returns it with its API key. */
export async function addTenant(
  db: Database,
  overrides: Partial<{ id: string; allowsTraining: boolean; requestQuota: number }> = {},
) {
  const apiKey = generateApiKey()
  const tenant = { id: 'acme', name: 'Acme', allowsTraining: true, requestQuota: 100, ...overrides }
  await db.insert(tenants).values({ ...tenant, apiKeyHash: hashApiKey(apiKey) })
  return { ...tenant, apiKey }
}

export const fakeDetails: Details = { intent: 'cancel_order', confidence: 0.9, matches: [] }

/**
 * A stand-in for the real assistant that counts how often it's asked. By default it answers in two
 * pieces; `answer` can replace any part of that, or be a function that throws.
 */
export function fakeAssistant(answer: Partial<Answer> | (() => Promise<Answer>) = {}) {
  const assistant: Assistant & { calls: number } = {
    calls: 0,
    async lookUp() {
      assistant.calls++
      return fakeDetails
    },
    async answer() {
      if (typeof answer === 'function') return answer()
      return {
        outcome: 'answered',
        model: 'test-model',
        fallbackReason: null,
        text: (async function* () {
          yield 'You can cancel the order '
          yield 'from your account page.'
        })(),
        usage: () => ({ inputTokens: 620, outputTokens: 140, costUsd: 0.000536 }),
        ...answer,
      }
    },
  }
  return assistant
}

/** Reads a streamed reply into its events, e.g. [{ event: 'text', data: { text: '...' } }]. */
export async function readEvents(response: Response) {
  const body = await response.text()
  return body
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => ({
      event: block.match(/^event: (.*)$/m)?.[1] ?? '',
      data: JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? 'null') as Record<string, unknown>,
    }))
}
