import { z } from 'zod'

/**
 * A model's settings, given as JSON: its id, whether its provider may train on what it's sent,
 * how much it thinks before answering, and its prices in US dollars per million tokens.
 */
const ModelSetting = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      ctx.issues.push({ code: 'custom', message: 'must be valid JSON', input: text })
      return z.NEVER
    }
  })
  .pipe(
    z.object({
      id: z.string().min(1),
      training_allowed: z.boolean(),
      reasoning: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']),
      cost: z.object({
        input: z.number().nonnegative(),

        output: z.number().nonnegative(), // Hidden thinking tokens are billed as output.
      }),
    }),
  )

export type ModelSettings = z.infer<typeof ModelSetting>

const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8080),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: ModelSetting,
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: ModelSetting,
})

export type Config = z.infer<typeof Env>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid settings:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
