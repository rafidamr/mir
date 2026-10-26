import { createGoogle } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { type LanguageModel, streamText } from 'ai'
import type { Config } from '../config.ts'
import type { LLMClient } from './types.ts'

/** The longest answer a model may write, in tokens. */
const MAX_ANSWER_TOKENS = 500

/** The models, cheapest first sorted by the sum of their three prices. */
export function createLLMClients(config: Config): LLMClient[] {
  const openRouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY })
  const google = createGoogle({ apiKey: config.GEMINI_API_KEY })
  const clients = [
    {
      id: config.GEMINI_MODEL.id,
      cost: config.GEMINI_MODEL.cost,
      trainingAllowed: config.GEMINI_MODEL.training_allowed,
      call: callAiSdk(google(config.GEMINI_MODEL.id)),
    },
    {
      id: config.OPENROUTER_MODEL.id,
      cost: config.OPENROUTER_MODEL.cost,
      trainingAllowed: config.OPENROUTER_MODEL.training_allowed,
      call: callAiSdk(openRouter.chat(config.OPENROUTER_MODEL.id)),
    },
  ]
  return clients.sort((a, b) => totalPrice(a) - totalPrice(b))
}

function totalPrice({ cost }: LLMClient): number {
  return cost.input + cost.output + cost.reasoning
}

/** Calls a model through the Vercel AI SDK, passing on its text and token counts. */
function callAiSdk(model: LanguageModel): LLMClient['call'] {
  return async function* ({ instructions, message }, signal) {
    const result = streamText({
      model,
      instructions,
      prompt: message,
      abortSignal: signal,
      maxOutputTokens: MAX_ANSWER_TOKENS,
      // The router switches to another model instead of retrying this one.
      maxRetries: 0,
      // Errors arrive in the stream below.
      onError: () => {},
    })
    for await (const part of result.stream) {
      if (part.type === 'text-delta') yield { type: 'text', text: part.text }
      if (part.type === 'finish') {
        const usage = part.totalUsage
        yield {
          type: 'usage',
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
        }
      }
      if (part.type === 'error') throw part.error
      if (part.type === 'abort') throw new Error('stopped')
    }
  }
}
