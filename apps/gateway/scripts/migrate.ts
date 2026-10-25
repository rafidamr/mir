/**
 * Creates or updates the database tables from the SQL files in drizzle/.
 *
 *   npm run db:migrate
 */
import path from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { loadConfig } from '../src/config.ts'
import { createDatabase } from '../src/db/client.ts'

const { sql, db } = createDatabase(loadConfig().databaseUrl)
await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '..', 'drizzle') })
await sql.end()
console.log('Database tables are up to date.')
