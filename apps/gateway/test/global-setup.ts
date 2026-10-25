import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createDatabase } from '../src/db/client.ts'
import { migrationsFolder, testDatabaseUrl } from './helpers.ts'

/** Creates the test database if it's missing, then brings its tables up to date. */
export default async function setup() {
  const url = new URL(testDatabaseUrl)
  const name = url.pathname.slice(1)
  const server = postgres({ ...serverOptions(url), connect_timeout: 2, onnotice: () => {} })
  try {
    const [exists] = await server`select 1 from pg_database where datname = ${name}`
    if (!exists) await server.unsafe(`create database "${name}"`)
  } catch (error) {
    throw new Error(
      `Can't reach the test database at ${url.host}. Start it with: docker compose up -d db`,
      { cause: error },
    )
  } finally {
    await server.end()
  }

  const { sql, db } = createDatabase(testDatabaseUrl)
  await migrate(db, { migrationsFolder })
  await sql.end()
}

/** Connection details for the server's built-in "postgres" database. */
function serverOptions(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: 'postgres',
  }
}
