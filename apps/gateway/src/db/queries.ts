import { and, desc, eq, lt, sql, sum } from 'drizzle-orm'
import { hashApiKey } from '../api-keys.ts'
import type { Database } from './client.ts'
import { type NewRequest, requests, type Tenant, tenants } from './schema.ts'

export async function findTenantByKey(db: Database, apiKey: string): Promise<Tenant | undefined> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.apiKeyHash, hashApiKey(apiKey)))
  return tenant
}

export type QuotaCheck = { ok: true } | { ok: false; used: number; quota: number }

/**
 * Uses up one of the tenant's requests, but only while some are left. It's a single UPDATE, so two
 * requests arriving at the same moment can't both take the last one.
 */
export async function useOneRequest(db: Database, tenantId: string): Promise<QuotaCheck> {
  const [updated] = await db
    .update(tenants)
    .set({ requestsUsed: sql`${tenants.requestsUsed} + 1` })
    .where(and(eq(tenants.id, tenantId), lt(tenants.requestsUsed, tenants.requestQuota)))
    .returning({ id: tenants.id })
  if (updated) return { ok: true }

  const [tenant] = await db
    .select({ used: tenants.requestsUsed, quota: tenants.requestQuota })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
  return { ok: false, used: tenant?.used ?? 0, quota: tenant?.quota ?? 0 }
}

export async function recordRequest(db: Database, row: NewRequest): Promise<void> {
  await db.insert(requests).values(row)
}

export async function usageFor(db: Database, tenantId: string) {
  const [tenant] = await db
    .select({ quota: tenants.requestQuota, used: tenants.requestsUsed })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
  const [cost] = await db
    .select({ total: sum(requests.costUsd) })
    .from(requests)
    .where(eq(requests.tenantId, tenantId))
  const recent = await db
    .select()
    .from(requests)
    .where(eq(requests.tenantId, tenantId))
    .orderBy(desc(requests.createdAt))
    .limit(20)

  const quota = tenant?.quota ?? 0
  const used = tenant?.used ?? 0
  return {
    quota,
    used,
    remaining: Math.max(quota - used, 0),
    totalCostUsd: Number(cost?.total ?? 0),
    recent,
  }
}
