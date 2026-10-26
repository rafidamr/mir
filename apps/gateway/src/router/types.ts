/** What a model is given: how to behave (instructions) and the customer's message. */
export interface Prompt {
  instructions: string
  message: string
}

/** What a model sends while it answers: pieces of text, then its token counts. */
export type ModelEvent = { type: 'text'; text: string } | ({ type: 'usage' } & Tokens)

export interface Tokens {
  inputTokens: number
  /** All output tokens, including hidden "thinking" (reasoning) tokens. */
  outputTokens: number
  reasoningTokens: number
}

/** US dollars per million tokens. */
export interface ModelCost {
  input: number
  output: number
  reasoning: number
}

export interface LLMClient {
  id: string
  cost: ModelCost
  /** Whether the provider may train on what it's sent. Skipped for tenants that say no. */
  trainingAllowed: boolean
  /** Starts a streamed answer. The call stops when the signal is aborted. */
  call: (prompt: Prompt, signal: AbortSignal) => AsyncIterable<ModelEvent>
}

/** Data received by the router for calls to LLM */
export interface RouterRequest {
  prompt: Prompt
  allowsTraining: boolean
  /** Returns why the initial response can't be used, or null when they're fine. */
  doSanityCheck?: (firstWords: string) => string | null
  /** Aborting it stops the model during streaming, e.g. when the user goes away. */
  signal?: AbortSignal
}

/** Data received from LLM calls for the router's callers */
export interface RouterResponse {
  model: string
  /** Why earlier models were passed over, or null when the first one answered. */
  fallbackReason: string | null
  /** The answer as it's written. */
  text: AsyncIterable<string>
  /** Tokens and cost, complete once `text` has been read to the end. */
  usage: () => { inputTokens: number; outputTokens: number; costUsd: number }
}
