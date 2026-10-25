export interface BitextRow {
  /** Stable id from the row's position in the original file, e.g. "bitext-00042". */
  id: string
  /** Bitext's tags for the wording style, e.g. Q = colloquial, Z = typos. */
  flags: string
  instruction: string
  category: string
  intent: string
  response: string
}

export interface SplitSizes {
  knowledgeBase: number
  practicePerIntent: number
  /** At least one per intent; any extra go to randomly chosen intents. */
  test: number
}

export interface DatasetSplit {
  knowledgeBase: BitextRow[]
  practice: BitextRow[]
  test: BitextRow[]
}

/** A question at least this similar to a knowledge-base question counts as a near-copy of it. */
export const NEAR_COPY_SIMILARITY = 0.95

/** The key used to spot duplicate questions: ignores case, punctuation, spacing and placeholder names. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\{\{[^}]*\}\}/g, ' {{}} ')
    .replace(/[^a-z0-9{}\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Keeps the first row of each group of duplicate questions. */
export function dedupeQuestions(rows: readonly BitextRow[]): BitextRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = normalizeQuestion(row.instruction)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A small seeded random number generator (mulberry32), so a split can be repeated exactly. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = result[i] as T
    result[i] = result[j] as T
    result[j] = a
  }
  return result
}

/**
 * Splits rows into three groups that share no question, with the same number per intent. Taking
 * the test group first, then practice, then the knowledge base, all from one shuffled pool per
 * intent, is what keeps the groups apart.
 */
export function splitByIntent(
  rows: readonly BitextRow[],
  sizes: SplitSizes,
  seed: number,
): DatasetSplit {
  const rng = createRng(seed)
  const intents = [...new Set(rows.map((row) => row.intent))].sort()
  if (sizes.test < intents.length) {
    throw new Error(`The test group needs at least one question per intent (${intents.length})`)
  }

  const pools = new Map(
    intents.map((intent) => [
      intent,
      shuffle(
        rows.filter((row) => row.intent === intent),
        rng,
      ),
    ]),
  )
  const take = (intent: string, count: number): BitextRow[] => {
    const pool = pools.get(intent) ?? []
    if (pool.length < count) {
      throw new Error(
        `Not enough questions for intent "${intent}": need ${count}, have ${pool.length}`,
      )
    }
    return pool.splice(0, count)
  }

  const testCounts = spreadEvenly(sizes.test, intents, rng)
  const knowledgeBaseCounts = spreadEvenly(sizes.knowledgeBase, intents, rng)
  const test = intents.flatMap((intent) => take(intent, testCounts.get(intent) ?? 0))
  const practice = intents.flatMap((intent) => take(intent, sizes.practicePerIntent))
  const knowledgeBase = intents.flatMap((intent) =>
    take(intent, knowledgeBaseCounts.get(intent) ?? 0),
  )
  return { knowledgeBase, practice, test }
}

/** Splits a total across intents as evenly as possible; the leftovers go to random intents. */
function spreadEvenly(
  total: number,
  intents: readonly string[],
  rng: () => number,
): Map<string, number> {
  const base = Math.floor(total / intents.length)
  const extra = new Set(shuffle(intents, rng).slice(0, total - base * intents.length))
  return new Map(intents.map((intent) => [intent, base + (extra.has(intent) ? 1 : 0)]))
}
