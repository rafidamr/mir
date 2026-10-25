import { describe, expect, it } from 'vitest'
import { createKnowledgeBase, type KbEntry } from '../src/retrieval/knowledge-base.ts'

function entry(id: string, intent: string): KbEntry {
  return { id, intent, category: 'TEST', instruction: id, response: id }
}

function unit(values: number[]): number[] {
  const length = Math.hypot(...values)
  return values.map((v) => v / length)
}

const entries = [entry('a', 'one'), entry('b', 'two'), entry('c', 'three')]
const vectors = new Float32Array([...unit([1, 0]), ...unit([1, 1]), ...unit([0, 1])])

describe('knowledge base search', () => {
  it('returns the closest entries first, with their similarity', () => {
    const kb = createKnowledgeBase(entries, vectors, 2)
    const matches = kb.search(new Float32Array(unit([1, 0.1])), 2)
    expect(matches.map((m) => m.entry.id)).toEqual(['a', 'b'])
    expect(matches[0]?.similarity).toBeGreaterThan(matches[1]?.similarity ?? 1)
    expect(matches[0]?.similarity).toBeCloseTo(unit([1, 0.1])[0] ?? 0, 5)
  })

  it('returns everything when asked for more than it has', () => {
    const kb = createKnowledgeBase(entries, vectors, 2)
    expect(kb.search(new Float32Array(unit([0, 1])), 10).map((m) => m.entry.id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('rejects vectors of the wrong size', () => {
    expect(() => createKnowledgeBase(entries, new Float32Array(5), 2)).toThrow()
    const kb = createKnowledgeBase(entries, vectors, 2)
    expect(() => kb.search(new Float32Array(3), 1)).toThrow()
  })
})
