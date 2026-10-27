import { describe, expect, it } from 'vitest'
import { createAssistant, isJunk, REFUSAL } from '../src/assistant/assistant.ts'
import type { Tenant } from '../src/db/schema.ts'
import { createRouter } from '../src/router/router.ts'
import type { LLMClient } from '../src/router/types.ts'
import { embedder, fakeModel, goodAnswer, kb } from './fakes.ts'

const tenant: Tenant = {
  id: 'tenant1',
  name: 'Tenant One',
  apiKeyHash: 'x',
  allowsTraining: true,
  requestQuota: 10,
  requestsUsed: 0,
}

async function readAll(text: AsyncIterable<string>): Promise<string> {
  let all = ''
  for await (const piece of text) all += piece
  return all
}

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
