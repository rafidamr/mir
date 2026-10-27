import type { Embedder } from '../src/assistant/embedder.ts'
import { createKnowledgeBase, type KbEntry } from '../src/assistant/knowledge-base.ts'
import type { LLMClient, ModelCost, Prompt } from '../src/router/types.ts'

function unit(values: number[]): number[] {
  const length = Math.hypot(...values)
  return values.map((v) => v / length)
}

function entry(id: string, intent: string, response: string): KbEntry {
  return { id, intent, category: 'TEST', instruction: `question ${id}`, response }
}

// A tiny knowledge base where each question is 3 numbers: three cancel questions, two tracking
// questions, and four questions with different intents that sit between everything.
const knowledge: Array<[KbEntry, number[]]> = [
  [entry('c1', 'cancel_order', 'Cancel it by pressing Cancel in Orders.'), [1, 0.05, 0]],
  [entry('c2', 'cancel_order', 'Orders can be cancelled before they ship.'), [1, 0, 0.05]],
  [entry('c3', 'cancel_order', 'You can cancel from the Orders page.'), [1, 0.1, 0.1]],
  [entry('t1', 'track_order', 'Track it from the Orders page.'), [0.05, 1, 0]],
  [entry('t2', 'track_order', 'Use the tracking link in your email.'), [0, 1, 0.05]],
  [entry('r1', 'get_refund', 'Refunds take 5 days.'), [0.6, 0.6, 0.5]],
  [entry('i1', 'get_invoice', 'Invoices are in your account.'), [0.6, 0.5, 0.6]],
  [entry('p1', 'payment_issue', 'Check your card details.'), [0.5, 0.6, 0.6]],
  [entry('d1', 'delivery_options', 'We deliver in 2 to 5 days.'), [0.55, 0.55, 0.62]],
]

export const kb = createKnowledgeBase(
  knowledge.map(([e]) => e),
  new Float32Array(knowledge.flatMap(([, v]) => unit(v))),
  3,
)

/** The messages the fake embedder knows. Anything else lands far from everything (off-topic). */
const messages: Record<string, number[]> = {
  'I want to cancel my order': [1, 0, 0],
  "What's the weather like?": [0, 0, 1],
  'I have a problem with something': [1, 1, 1],
}

export const embedder: Embedder = {
  spec: { id: 'fake', pooling: 'mean', dtype: 'q8' },
  dimensions: 3,
  async embed(texts) {
    return texts.map((text) => new Float32Array(unit(messages[text] ?? [0, 0, 1])))
  },
}

export const goodAnswer = [
  'Sure, you can cancel it from the Orders page. ',
  'Press Cancel next to the order.',
]

/**
 * A fake model. It remembers each prompt and stop signal it gets, sends these pieces of text,
 * then finishes, fails, or waits until it's stopped.
 */
export function fakeModel(
  id: string,
  pieces: string[],
  options: { end?: 'finish' | 'hang' | Error; trainingAllowed?: boolean; cost?: ModelCost } = {},
) {
  const prompts: Prompt[] = []
  const signals: AbortSignal[] = []
  const model: LLMClient & { prompts: Prompt[]; signals: AbortSignal[] } = {
    id,
    cost: options.cost ?? { input: 0, output: 0, reasoning: 0 },
    trainingAllowed: options.trainingAllowed ?? false,
    prompts,
    signals,
    async *call(prompt, signal) {
      prompts.push(prompt)
      signals.push(signal)
      for (const text of pieces) yield { type: 'text', text }
      if (options.end === 'hang') await untilStopped(signal)
      if (options.end instanceof Error) throw options.end
      yield { type: 'usage', inputTokens: 10, outputTokens: 5, reasoningTokens: 0 }
    },
  }
  return model
}

/** Waits until the signal says stop, including when it already has. */
export function untilStopped(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Error('stopped'))
    signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
  })
}
