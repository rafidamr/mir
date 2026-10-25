import { describe, expect, it } from 'vitest'
import {
  type BitextRow,
  dedupeQuestions,
  normalizeQuestion,
  splitByIntent,
} from '../scripts/lib/dataset.ts'

function rows(intents: string[], perIntent: number): BitextRow[] {
  return intents.flatMap((intent) =>
    Array.from({ length: perIntent }, (_, i) => ({
      id: `${intent}-${i}`,
      flags: 'B',
      instruction: `question ${i} about ${intent}`,
      category: 'TEST',
      intent,
      response: `answer ${i}`,
    })),
  )
}

const sizes = { knowledgeBase: 20, practicePerIntent: 3, test: 5 }
const intents = ['alpha', 'beta', 'gamma']

describe('normalizeQuestion', () => {
  it('ignores case, punctuation, spacing and placeholder names', () => {
    expect(normalizeQuestion('  Cancel   order {{Order Number}}?! ')).toBe(
      normalizeQuestion('cancel order {{Order ID}}'),
    )
  })
})

describe('dedupeQuestions', () => {
  it('keeps the first of questions that only differ in formatting', () => {
    const [first, second] = rows(['alpha'], 2)
    if (!first || !second) throw new Error('fixture')
    const copy = { ...first, id: 'copy', instruction: first.instruction.toUpperCase() }
    expect(dedupeQuestions([first, copy, second]).map((r) => r.id)).toEqual([first.id, second.id])
  })
})

describe('splitByIntent', () => {
  const data = rows(intents, 20)

  it('produces the requested sizes', () => {
    const split = splitByIntent(data, sizes, 42)
    expect(split.knowledgeBase).toHaveLength(20)
    expect(split.practice).toHaveLength(9)
    expect(split.test).toHaveLength(5)
  })

  it('never puts the same question in two groups', () => {
    const split = splitByIntent(data, sizes, 42)
    const ids = [...split.knowledgeBase, ...split.practice, ...split.test].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers every intent in every group', () => {
    const split = splitByIntent(data, sizes, 42)
    for (const group of [split.knowledgeBase, split.practice, split.test]) {
      expect(new Set(group.map((r) => r.intent))).toEqual(new Set(intents))
    }
  })

  it('spreads the knowledge base evenly across intents', () => {
    const counts = new Map<string, number>()
    for (const row of splitByIntent(data, sizes, 42).knowledgeBase) {
      counts.set(row.intent, (counts.get(row.intent) ?? 0) + 1)
    }
    const values = [...counts.values()]
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('gives the same split for the same seed and a different one for another seed', () => {
    const ids = (seed: number) => splitByIntent(data, sizes, seed).test.map((r) => r.id)
    expect(ids(42)).toEqual(ids(42))
    expect(ids(42)).not.toEqual(ids(7))
  })

  it('fails loudly when there is not enough data', () => {
    expect(() => splitByIntent(rows(intents, 5), sizes, 42)).toThrow()
    expect(() => splitByIntent(data, { ...sizes, test: 2 }, 42)).toThrow()
  })
})
