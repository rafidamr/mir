import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** SHA-256 of the API key. The key itself is never stored. */
  apiKeyHash: text('api_key_hash').notNull().unique(),
  /** When false, the tenant's data never goes to a model that may train on it. */
  allowsTraining: boolean('allows_training').notNull(),
  requestQuota: integer('request_quota').notNull(),
  requestsUsed: integer('requests_used').notNull().default(0),
})

export const outcomes = ['answered', 'refused', 'failed'] as const

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: text('outcome', { enum: outcomes }).notNull(),
    /** The model that wrote the answer. Empty when no model was called, e.g. an off-topic refusal. */
    model: text('model'),
    /** Why the router switched to the backup model. Empty when it didn't switch. */
    fallbackReason: text('fallback_reason'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 8, mode: 'number' }).notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
  },
  (t) => [index('requests_tenant_created').on(t.tenantId, t.createdAt.desc())],
)

export type Tenant = typeof tenants.$inferSelect
export type NewRequest = typeof requests.$inferInsert
