import { describe, expect, it } from 'vitest'
import { createAssistant, isJunk, REFUSAL } from '../src/assistant/assistant.ts'
import type { Embedder } from '../src/assistant/embedder.ts'
import { createKnowledgeBase, type KbEntry } from '../src/assistant/knowledge-base.ts'
import type { Tenant } from '../src/db/schema.ts'
import { createRouter } from '../src/router/router.ts'
import type { LLMClient, Prompt } from '../src/router/types.ts'

function unit(values: number[]): number[] {
  const length = Math.hypot(...values)
  return values.map((v) => v / length)
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
const kb = createKnowledgeBase(
  knowledge.map(([e]) => e),
  new Float32Array(knowledge.flatMap(([, v]) => unit(v))),
  3,
)

const messages: Record<string, number[]> = {
  'I want to cancel my order': [1, 0, 0],
  "What's the weather like?": [0, 0, 1],
  'I have a problem with something': [1, 1, 1],
}
const embedder: Embedder = {
  spec: { id: 'fake', pooling: 'mean', dtype: 'q8' },
  dimensions: 3,
  async embed(texts) {
    return texts.map((text) => new Float32Array(unit(messages[text] ?? [0, 0, 1])))
  },
}

const tenant: Tenant = {
  id: 'acme',
  name: 'Acme',
  apiKeyHash: 'x',
  allowsTraining: true,
  requestQuota: 10,
  requestsUsed: 0,
}

function entry(id: string, intent: string, response: string): KbEntry {
  return { id, intent, category: 'TEST', instruction: `question ${id}`, response }
}

/** A fake model that remembers what it was asked and answers with these pieces. */
function fakeModel(id: string, pieces: string[]) {
  const prompts: Prompt[] = []
  const model: LLMClient & { prompts: Prompt[] } = {
    id,
    cost: { input: 0, output: 0, reasoning: 0 },
    trainingAllowed: false,
    prompts,
    async *call(prompt) {
      prompts.push(prompt)
      for (const text of pieces) yield { type: 'text', text }
      yield { type: 'usage', inputTokens: 10, outputTokens: 5, reasoningTokens: 0 }
    },
  }
  return model
}

async function readAll(text: AsyncIterable<string>): Promise<string> {
  let all = ''
  for await (const piece of text) all += piece
  return all
}

const goodAnswer = [
  'Sure, you can cancel it from the Orders page. ',
  'Press Cancel next to the order.',
]

async function ask(message: string, models: LLMClient[]) {
  const assistant = createAssistant({ kb, embedder, router: createRouter({ llmClients: models }) })
  const details = await assistant.lookUp(message)
  const answer = await assistant.answer(message, details, tenant, new AbortController().signal)
  return { details, answer, text: await readAll(answer.text) }
}

describe('assistant', () => {
  it('finds the intent, the confidence and the 5 closest matches', async () => {
    const { details } = await ask('I want to cancel my order', [fakeModel('m', goodAnswer)])
    expect(details.intent).toBe('cancel_order')
    expect(details.confidence).toBeGreaterThan(0.6)
    expect(details.matches).toHaveLength(5)
    expect(details.matches[0]).toMatchObject({ id: 'c1', intent: 'cancel_order' })
  })

  it('refuses an off-topic message without calling a model', async () => {
    const model = fakeModel('m', goodAnswer)
    const { answer, text } = await ask("What's the weather like?", [model])
    expect(answer).toMatchObject({ outcome: 'refused', model: null })
    expect(text).toBe(REFUSAL)
    expect(model.prompts).toHaveLength(0)
  })

  it('refuses when the matches disagree about the intent, without calling a model', async () => {
    const model = fakeModel('m', goodAnswer)
    const { details, answer } = await ask('I have a problem with something', [model])
    expect(details.confidence).toBeLessThan(0.4)
    expect(answer.outcome).toBe('refused')
    expect(model.prompts).toHaveLength(0)
  })

  it('gives the model the intent and up to 3 sample replies with that intent', async () => {
    const model = fakeModel('m', goodAnswer)
    const { answer, text } = await ask('I want to cancel my order', [model])
    expect(answer).toMatchObject({ outcome: 'answered', model: 'm' })
    expect(text).toBe(goodAnswer.join(''))
    const [prompt] = model.prompts
    expect(prompt?.message).toBe('I want to cancel my order')
    expect(prompt?.instructions).toContain('cancel order')
    expect(prompt?.instructions).toContain('Cancel it by pressing Cancel in Orders.')
    expect(prompt?.instructions).toContain('You can cancel from the Orders page.')
    expect(prompt?.instructions).not.toContain('Refunds take 5 days.')
  })

  it('switches to the next model when the first one starts with junk', async () => {
    const junk = fakeModel('junk', ['%$#@!&*^~ ;;;; ::::: ~~~~ ^^^^ ###### @@@@@'])
    const { answer, text } = await ask('I want to cancel my order', [
      junk,
      fakeModel('good', goodAnswer),
    ])
    expect(answer).toMatchObject({ model: 'good', fallbackReason: 'junk: junk answer' })
    expect(text).toBe(goodAnswer.join(''))
  })
})

describe('isJunk', () => {
  it('flags an answer that starts with junk, and passes normal text', () => {
    expect(isJunk('%$#@!&*^~ ;;;; ::::: ~~~~')).toBe('junk answer')
    expect(isJunk('Sure, I can help you cancel that order.')).toBeNull()
  })
})
