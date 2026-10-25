import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

export function createDatabase(url: string) {
  const sql = postgres(url, {
    /** Seconds. Give up quickly when the database can't be reached. */
    connect_timeout: 2,
    /** Neon's pooled connections don't support prepared statements. */
    prepare: false,
    onnotice: () => {},
  })
  return { sql, db: drizzle(sql, { schema }) }
}

export type Database = ReturnType<typeof createDatabase>['db']
