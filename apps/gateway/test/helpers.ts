import path from 'node:path'
import { sql } from 'drizzle-orm'
import { generateApiKey, hashApiKey } from '../src/lib/api-keys.ts'
import type { Assistant, AssistantReply } from '../src/assistant/types.ts'
import { createDatabase, type Database } from '../src/db/client.ts'
import { tenants } from '../src/db/schema.ts'

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

export const answeredReply: AssistantReply = {
  outcome: 'answered',
  answer: 'You can cancel the order from your account page.',
  model: 'test-model',
  fallbackReason: null,
  inputTokens: 620,
  outputTokens: 140,
  costUsd: 0.000536,
}

/** A stand-in for the real assistant that counts how often it's asked. */
export function fakeAssistant(reply: AssistantReply = answeredReply) {
  const assistant: Assistant & { calls: number } = {
    calls: 0,
    async reply() {
      assistant.calls++
      return reply
    },
  }
  return assistant
}
