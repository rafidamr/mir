import type { Tenant } from '../db/schema.ts'

export interface AssistantReply {
  outcome: 'answered' | 'refused' | 'failed'
  answer: string
  /** The model that wrote the answer, or null when no model was called. */
  model: string | null
  /** Why the router switched to the backup model, or null when it didn't. */
  fallbackReason: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface Assistant {
  reply(message: string, tenant: Tenant): Promise<AssistantReply>
}
