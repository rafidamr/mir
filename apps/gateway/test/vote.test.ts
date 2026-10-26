import { describe, expect, it } from 'vitest'
import type { KbEntry, Match } from '../src/assistant/knowledge-base.ts'
import { voteOnIntent } from '../src/assistant/vote.ts'

function match(intent: string, similarity: number): Match {
  const entry: KbEntry = {
    id: `${intent}-${similarity}`,
    intent,
    category: 'TEST',
    instruction: `question about ${intent}`,
    response: `answer about ${intent}`,
  }
  return { entry, similarity }
}

describe('voteOnIntent', () => {
  it('picks the intent with the most combined similarity among the voters', () => {
    const matches = [
      match('cancel_order', 0.9),
      match('change_order', 0.85),
      match('change_order', 0.8),
      match('cancel_order', 0.5),
    ]
    const vote = voteOnIntent(matches, 3)
    expect(vote.intent).toBe('change_order')
    expect(vote.voters).toBe(3)
    expect(vote.confidence).toBeCloseTo(1.65 / 2.55, 6)
    expect(vote.topSimilarity).toBe(0.9)
  })

  it('only counts the first X matches', () => {
    const matches = [
      match('cancel_order', 0.9),
      match('change_order', 0.8),
      match('change_order', 0.8),
    ]
    expect(voteOnIntent(matches, 1).intent).toBe('cancel_order')
    expect(voteOnIntent(matches, 1).confidence).toBe(1)
  })

  it('gives full confidence when every voter agrees', () => {
    const matches = [
      match('track_order', 0.7),
      match('track_order', 0.6),
      match('track_order', 0.5),
    ]
    expect(voteOnIntent(matches, 3)).toMatchObject({ intent: 'track_order', confidence: 1 })
  })

  it('breaks a tie in favour of the intent with the better-ranked match', () => {
    const matches = [match('review', 0.8), match('complaint', 0.8)]
    expect(voteOnIntent(matches, 2).intent).toBe('review')
  })

  it('can count plain votes instead of similarity', () => {
    const matches = [
      match('cancel_order', 0.95),
      match('change_order', 0.5),
      match('change_order', 0.4),
    ]
    expect(voteOnIntent(matches, 3).intent).toBe('cancel_order')
    expect(voteOnIntent(matches, 3, { weighted: false }).intent).toBe('change_order')
  })

  it('uses only the matches that exist when X is larger', () => {
    const vote = voteOnIntent([match('get_invoice', 0.7)], 5)
    expect(vote).toMatchObject({ intent: 'get_invoice', voters: 1, confidence: 1 })
  })

  it('returns the full tally, highest first', () => {
    const matches = [match('a', 0.9), match('b', 0.8), match('b', 0.7)]
    expect(voteOnIntent(matches, 3).tally.map((t) => t.intent)).toEqual(['b', 'a'])
  })

  it('refuses to vote with no matches or a bad X', () => {
    expect(() => voteOnIntent([], 3)).toThrow()
    expect(() => voteOnIntent([match('a', 0.9)], 0)).toThrow()
  })
})
