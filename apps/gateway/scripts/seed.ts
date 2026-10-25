/**
 * Creates the demo tenants with fresh API keys, and prints the keys. They're stored scrambled, so
 * this is the only time they can be seen. Re-running replaces the keys and resets the usage.
 *
 *   npm run db:seed
 */
import { generateApiKey, hashApiKey } from '../src/api-keys.ts'
import { loadConfig } from '../src/config.ts'
import { createDatabase } from '../src/db/client.ts'
import { tenants } from '../src/db/schema.ts'

const DEMO_TENANTS = [
  { id: 'acme', name: 'Acme', allowsTraining: true, requestQuota: 1000 },
  { id: 'globex', name: 'Globex', allowsTraining: false, requestQuota: 1000 },
  { id: 'tiny', name: 'Tiny', allowsTraining: true, requestQuota: 3 },
  { id: 'eval', name: 'Evaluation', allowsTraining: true, requestQuota: 5000 },
]

const { sql, db } = createDatabase(loadConfig().databaseUrl)
for (const tenant of DEMO_TENANTS) {
  const apiKey = generateApiKey()
  const values = { ...tenant, apiKeyHash: hashApiKey(apiKey), requestsUsed: 0 }
  await db.insert(tenants).values(values).onConflictDoUpdate({ target: tenants.id, set: values })
  console.log(`${tenant.id.padEnd(8)} ${apiKey}`)
}
await sql.end()
