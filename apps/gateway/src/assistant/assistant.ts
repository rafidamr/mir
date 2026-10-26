import type { Tenant } from '../db/schema.ts'
import type { createRouter } from '../router/router.ts'
import type { Embedder } from './embedder.ts'
import type { KnowledgeBase } from './knowledge-base.ts'
import { voteOnIntent } from './vote.ts'

/** What the lookup found, sent to the customer before the answer. */
export interface Details {
  intent: string
  confidence: number
  matches: Array<{
    id: string
    question: string
    intent: string
    reply: string
    similarity: number
  }>
}

export interface Answer {
  outcome: 'answered' | 'refused'
  /** The model writing the answer, or null for a refusal (no model is called). */
  model: string | null
  fallbackReason: string | null
  text: AsyncIterable<string>
  usage: () => { inputTokens: number; outputTokens: number; costUsd: number }
}

export interface Assistant {
  lookUp(message: string): Promise<Details>
  /** Throws AllModelsFailedError when no model can answer. */
  answer(message: string, details: Details, tenant: Tenant, signal: AbortSignal): Promise<Answer>
}

/** How many closest matches vote on the intent (chosen with the practice questions). */
const VOTERS = 5
/** Below this, even the closest match is far away: the message is off-topic. */
const OFF_TOPIC_BELOW = 0.75
/** Below this, the matches disagree too much about the intent. */
const UNSURE_BELOW = 0.4
/** How many sample replies the model is shown. */
const EXAMPLES = 3

export const REFUSAL =
  "I'm sorry, I can't help with that here. Please connect with a human agent by calling +62-888-000-000"

export function createAssistant({
  kb,
  embedder,
  router,
}: {
  kb: KnowledgeBase
  embedder: Embedder
  router: ReturnType<typeof createRouter>
}): Assistant {
  return {
    async lookUp(message) {
      const [vector] = await embedder.embed([message])
      if (!vector) throw new Error('The embedding model returned nothing')
      const matches = kb.search(vector, VOTERS)
      const vote = voteOnIntent(matches, VOTERS)
      return {
        intent: vote.intent,
        confidence: vote.confidence,
        matches: matches.map(({ entry, similarity }) => ({
          id: entry.id,
          question: entry.instruction,
          intent: entry.intent,
          reply: entry.response,
          similarity,
        })),
      }
    },

    async answer(message, details, tenant, signal) {
      const topSimilarity = details.matches[0]?.similarity ?? 0
      if (topSimilarity < OFF_TOPIC_BELOW || details.confidence < UNSURE_BELOW) {
        return {
          outcome: 'refused',
          model: null,
          fallbackReason: null,
          text: (async function* () {
            yield REFUSAL
          })(),
          usage: () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }),
        }
      }
      const routed = await router.route({
        prompt: { instructions: instructionsFor(details), message },
        allowsTraining: tenant.allowsTraining,
        doSanityCheck: isJunk,
        signal,
      })
      return { outcome: 'answered', ...routed }
    },
  }
}

function instructionsFor({ intent, matches }: Details): string {
  const examples = matches
    .filter((match) => match.intent === intent)
    .slice(0, EXAMPLES)
    .map((match, i) => `Example ${i + 1}:\n${match.reply}`)
  return [
    "You are a customer support assistant. Reply to the customer's message.",
    `The customer's request is about: ${intent.replaceAll('_', ' ')}.`,
    'Base your reply on these example replies from our support team:',
    ...examples,
    'Keep the reply under 120 words. Keep placeholders like {{Order Number}} exactly as they are. Do not make up policies, prices or dates that are not in the examples.',
  ].join('\n\n')
}

/** The start of an answer is junk when fewer than half of its visible characters are letters. */
export function isJunk(words: string): string | null {
  const visible = words.replace(/\s/g, '').length
  const letters = words.match(/\p{L}/gu)?.length ?? 0
  return letters < visible / 2 ? 'junk answer' : null
}
