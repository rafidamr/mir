import { z } from 'zod'

const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8080),
})

export interface Config {
  databaseUrl: string
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid settings:\n${z.prettifyError(parsed.error)}`)
  }
  return { databaseUrl: parsed.data.DATABASE_URL, port: parsed.data.PORT }
}
