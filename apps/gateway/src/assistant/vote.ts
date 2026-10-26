import type { Match } from './knowledge-base.ts'

export interface IntentVote {
  intent: string
  /** Share of the votes that back the winning intent, from 0 to 1. */
  confidence: number
  /** Similarity of the single closest match. Low means the message is unlike anything we know. */
  topSimilarity: number
  /** How many matches voted. Fewer than asked for if there weren't enough matches. */
  voters: number
  /** Every intent that got votes, highest first. */
  tally: Array<{ intent: string; weight: number }>
}

export interface VoteOptions {
  /** Weigh each vote by its similarity (default), or count every vote as one. */
  weighted?: boolean
}

/** The closest `voters` matches vote on the customer's intent. Matches must be closest first. */
export function voteOnIntent(
  matches: readonly Match[],
  voters: number,
  options: VoteOptions = {},
): IntentVote {
  if (!Number.isInteger(voters) || voters < 1) {
    throw new RangeError(`voters must be a positive whole number, got ${voters}`)
  }
  const closest = matches[0]
  if (!closest) throw new Error('Cannot vote without any matches')

  const weighted = options.weighted ?? true
  const ballots = matches.slice(0, voters)
  // A Map keeps insertion order, i.e. the rank of each intent's best match. The sort below is
  // stable, so on a tie the intent with the better-ranked match wins.
  const weights = new Map<string, number>()
  for (const { entry, similarity } of ballots) {
    const weight = weighted ? Math.max(similarity, 0) : 1
    weights.set(entry.intent, (weights.get(entry.intent) ?? 0) + weight)
  }
  const tally = [...weights]
    .map(([intent, weight]) => ({ intent, weight }))
    .sort((a, b) => b.weight - a.weight)
  const total = tally.reduce((sum, t) => sum + t.weight, 0)
  const winner = tally[0] ?? { intent: closest.entry.intent, weight: 0 }

  return {
    intent: winner.intent,
    confidence: total > 0 ? winner.weight / total : 0,
    topSimilarity: closest.similarity,
    voters: ballots.length,
    tally,
  }
}
