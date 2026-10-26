/**
 * Measures "the closest X matches vote on the intent" on the practice questions, and suggests
 * the two refusal cut-offs. No AI calls, so it's free to run.
 *
 *   npm run data:benchmark                     # the model the knowledge base was built with
 *   npm run data:benchmark -- --model minilm   # try another embedding model
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  createEmbedder,
  EMBEDDING_MODELS,
  type EmbeddingModelName,
} from '../src/assistant/embedder.ts'
import {
  createKnowledgeBase,
  loadKnowledgeBase,
  type Match,
} from '../src/assistant/knowledge-base.ts'
import { type IntentVote, voteOnIntent } from '../src/assistant/vote.ts'
import { parseJsonl } from '../src/lib/jsonl.ts'
import { type BitextRow, NEAR_COPY_SIMILARITY } from './lib/dataset.ts'
import { embedInBatches, flatten } from './lib/embed.ts'
import { paths } from './lib/paths.ts'

const VOTER_COUNTS = [1, 3, 5, 7, 9, 11, 15]
/** The off-topic cut-off may refuse at most this share of real support questions. */
const MAX_REAL_REFUSED = 0.01
/** Scoring for the confidence cut-off: a wrong answer is worse than handing over to a person. */
const SCORE = { right: 1, wrong: -2, refused: 0 }
const SIMILARITY_CUTOFFS = steps(0.3, 0.95, 0.05)
const CONFIDENCE_CUTOFFS = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

const { values } = parseArgs({ options: { model: { type: 'string' } } })
const { kb: storedKb, manifest } = await loadKnowledgeBase(paths.kbDir)
const modelName = values.model ?? nameOf(manifest.embedding.model)
if (!(modelName in EMBEDDING_MODELS)) {
  throw new Error(
    `Unknown model "${modelName}". Choose: ${Object.keys(EMBEDDING_MODELS).join(', ')}`,
  )
}
const spec = EMBEDDING_MODELS[modelName as EmbeddingModelName]
const embedder = await createEmbedder(spec, { cacheDir: paths.modelCache })
const kb =
  spec.id === manifest.embedding.model
    ? storedKb
    : createKnowledgeBase(
        storedKb.entries,
        flatten(
          await embedInBatches(
            embedder,
            storedKb.entries.map((e) => e.instruction),
            'knowledge base',
          ),
          embedder.dimensions,
        ),
        embedder.dimensions,
      )

const practice = parseJsonl<BitextRow>(
  await readFile(path.join(paths.evalDir, 'practice.jsonl'), 'utf8'),
)
const offTopic = (
  JSON.parse(await readFile(path.join(paths.evalDir, 'offtopic.json'), 'utf8')) as {
    practice: string[]
  }
).practice

const maxVoters = Math.max(...VOTER_COUNTS)
const realMatches = (
  await embedInBatches(
    embedder,
    practice.map((r) => r.instruction),
    'practice questions',
  )
).map((v) => kb.search(v, maxVoters))
const offTopicMatches = (await embedInBatches(embedder, offTopic, 'off-topic messages')).map((v) =>
  kb.search(v, maxVoters),
)
const speed = await timeOneMessage()

// 1. How many matches should vote?
const byVoters = VOTER_COUNTS.map((x) => ({
  x,
  weighted: countRight(realMatches.map((m) => voteOnIntent(m, x))),
  plain: countRight(realMatches.map((m) => voteOnIntent(m, x, { weighted: false }))),
}))
const best = byVoters.reduce((a, b) => (b.weighted > a.weighted ? b : a))
const votes = realMatches.map((m) => voteOnIntent(m, best.x))

// 2. Off-topic cut-off. If every off-topic message scores below every real question, cut in the
// middle of that gap. Otherwise take the highest cut-off that refuses at most 1% of real ones.
const realTop = topSimilarities(realMatches)
const offTopicTop = topSimilarities(offTopicMatches)
const highestOffTopic = offTopicTop.at(-1) ?? 0
const lowestReal = realTop[0] ?? 1
const hasGap = highestOffTopic < lowestReal
const similarityCutoff = hasGap
  ? round2((highestOffTopic + lowestReal) / 2)
  : floor2(quantile(realTop, MAX_REAL_REFUSED))
const similarityRule = hasGap
  ? `the middle of the gap between the highest off-topic message (${fmt(highestOffTopic)}) and the lowest real question (${fmt(lowestReal)})`
  : `the highest cut-off that refuses at most ${MAX_REAL_REFUSED * 100}% of real questions`

// 4. Near-copies: practice questions with an almost identical question in the knowledge base.
const nearCopies = votes.flatMap((vote, i) =>
  vote.topSimilarity >= NEAR_COPY_SIMILARITY ? [i] : [],
)
const others = votes.flatMap((vote, i) => (vote.topSimilarity < NEAR_COPY_SIMILARITY ? [i] : []))
const rightAmong = (indexes: readonly number[]) =>
  indexes.filter((i) => votes[i]?.intent === practice[i]?.intent).length

// 3. Confidence cut-off, among the questions that pass the off-topic cut-off.
const passing = votes.flatMap((vote, i) => {
  const row = practice[i]
  return row && vote.topSimilarity >= similarityCutoff ? [{ vote, row }] : []
})
const confidenceRows = CONFIDENCE_CUTOFFS.map((cutoff) => {
  const answered = passing.filter((p) => p.vote.confidence >= cutoff)
  const right = answered.filter((p) => p.vote.intent === p.row.intent).length
  const lost = passing.filter(
    (p) => p.vote.confidence < cutoff && p.vote.intent === p.row.intent,
  ).length
  const wrong = answered.length - right
  const score = right * SCORE.right + wrong * SCORE.wrong
  return { cutoff, answered: answered.length, right, wrong, lost, score }
})
const bestConfidence = confidenceRows.reduce((a, b) => (b.score > a.score ? b : a))

const report = [
  `# Vote benchmark: ${modelName}`,
  '',
  `${practice.length} practice questions, ${offTopic.length} off-topic practice messages, knowledge base \`${manifest.version}\` (${kb.entries.length} entries). No AI calls.`,
  '',
  '## How many matches should vote?',
  '',
  'Share of practice questions where the vote picks the right intent.',
  '',
  '| X (matches voting) | Votes weighed by similarity | One vote each |',
  '|---|---|---|',
  ...byVoters.map(
    (r) => `| ${r.x} | ${pct(r.weighted, practice.length)} | ${pct(r.plain, practice.length)} |`,
  ),
  '',
  `**Best: X = ${best.x}**, right for ${best.weighted} of ${practice.length} (${pct(best.weighted, practice.length)}).`,
  '',
  `## Near-copies vs the rest (X = ${best.x})`,
  '',
  `A near-copy is a practice question whose closest knowledge-base question has a similarity of ${NEAR_COPY_SIMILARITY} or more. Bitext words each question many slightly different ways, so near-copies are common, and they make the vote's job easy.`,
  '',
  '| Group | Questions | Right |',
  '|---|---|---|',
  `| Near-copies | ${nearCopies.length} | ${pct(rightAmong(nearCopies), nearCopies.length)} |`,
  `| The rest | ${others.length} | ${pct(rightAmong(others), others.length)} |`,
  '',
  `## Which intents get mixed up? (X = ${best.x})`,
  '',
  '| Real intent | Right |',
  '|---|---|',
  ...perIntent(votes).map((r) => `| ${r.intent} | ${r.right} of ${r.total} |`),
  '',
  'Most common mix-ups:',
  '',
  '| Real intent | Voted as | Times |',
  '|---|---|---|',
  ...mixUps(votes)
    .slice(0, 10)
    .map((m) => `| ${m.real} | ${m.voted} | ${m.times} |`),
  '',
  '## Off-topic cut-off (similarity of the closest match)',
  '',
  `Real support questions: lowest ${fmt(realTop[0])}, 1% below ${fmt(quantile(realTop, 0.01))}, middle ${fmt(quantile(realTop, 0.5))}.`,
  `Off-topic messages: lowest ${fmt(offTopicTop[0])}, middle ${fmt(quantile(offTopicTop, 0.5))}, highest ${fmt(offTopicTop.at(-1))}.`,
  '',
  '| Cut-off | Real questions refused | Off-topic messages refused |',
  '|---|---|---|',
  ...SIMILARITY_CUTOFFS.map(
    (c) =>
      `| ${c.toFixed(2)} | ${pct(
        realTop.filter((s) => s < c).length,
        realTop.length,
      )} | ${offTopicTop.filter((s) => s < c).length} of ${offTopicTop.length} |`,
  ),
  '',
  `**Suggested: ${similarityCutoff.toFixed(2)}**, ${similarityRule}. It refuses ${pct(
    realTop.filter((s) => s < similarityCutoff).length,
    realTop.length,
  )} of real questions and ${offTopicTop.filter((s) => s < similarityCutoff).length} of ${offTopicTop.length} off-topic messages.`,
  '',
  `## Confidence cut-off (X = ${best.x})`,
  '',
  `Confidence is how strongly the voters agree. Below the cut-off, the assistant refuses. Counted over the ${passing.length} practice questions that pass the off-topic cut-off.`,
  '',
  '| Cut-off | Answered | Right | Wrong | Right answers lost |',
  '|---|---|---|---|---|',
  ...confidenceRows.map(
    (r) => `| ${r.cutoff.toFixed(2)} | ${r.answered} | ${r.right} | ${r.wrong} | ${r.lost} |`,
  ),
  '',
  `**Suggested: ${bestConfidence.cutoff.toFixed(2)}**. Each right answer counts +${SCORE.right}, each wrong answer ${SCORE.wrong} (a wrong answer is worse than handing over to a person), each refusal ${SCORE.refused}; this cut-off has the best total.`,
  '',
  '## Speed (this machine)',
  '',
  `Turning one message into numbers: ${speed.embedMs.toFixed(1)} ms. Searching ${kb.entries.length} entries: ${speed.searchMs.toFixed(2)} ms.`,
  '',
].join('\n')

await mkdir(paths.resultsDir, { recursive: true })
const reportFile = path.join(paths.resultsDir, `vote-benchmark-${modelName}.md`)
await writeFile(reportFile, report)
console.log(`\n${report}`)
console.log(`Saved to ${path.relative(paths.repoRoot, reportFile)}`)

function countRight(list: readonly IntentVote[]): number {
  return list.filter((vote, i) => vote.intent === practice[i]?.intent).length
}

function perIntent(list: readonly IntentVote[]) {
  const totals = new Map<string, { right: number; total: number }>()
  list.forEach((vote, i) => {
    const intent = practice[i]?.intent ?? '?'
    const t = totals.get(intent) ?? { right: 0, total: 0 }
    t.total++
    if (vote.intent === intent) t.right++
    totals.set(intent, t)
  })
  return [...totals]
    .map(([intent, t]) => ({ intent, ...t }))
    .sort((a, b) => a.right / a.total - b.right / b.total || a.intent.localeCompare(b.intent))
}

function mixUps(list: readonly IntentVote[]) {
  const counts = new Map<string, number>()
  list.forEach((vote, i) => {
    const real = practice[i]?.intent
    if (real && vote.intent !== real) {
      const key = `${real}|${vote.intent}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  })
  return [...counts]
    .map(([key, times]) => {
      const [real = '', voted = ''] = key.split('|')
      return { real, voted, times }
    })
    .sort((a, b) => b.times - a.times)
}

function topSimilarities(list: readonly Match[][]): number[] {
  return list.map((m) => m[0]?.similarity ?? 0).sort((a, b) => a - b)
}

async function timeOneMessage() {
  const embedMs: number[] = []
  const searchMs: number[] = []
  for (const row of practice.slice(0, 20)) {
    let start = performance.now()
    const [vector] = await embedder.embed([row.instruction])
    embedMs.push(performance.now() - start)
    start = performance.now()
    if (vector) kb.search(vector, maxVoters)
    searchMs.push(performance.now() - start)
  }
  return {
    embedMs: quantile(embedMs.sort(sortNumbers), 0.5),
    searchMs: quantile(searchMs.sort(sortNumbers), 0.5),
  }
}

/** Value below which a share `q` of the sorted values fall (linear interpolation). */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const a = sorted[lower] ?? 0
  const b = sorted[Math.min(lower + 1, sorted.length - 1)] ?? a
  return a + (b - a) * (position - lower)
}

function sortNumbers(a: number, b: number): number {
  return a - b
}

function nameOf(modelId: string): string {
  const entry = Object.entries(EMBEDDING_MODELS).find(([, s]) => s.id === modelId)
  if (!entry) throw new Error(`The knowledge base uses an unknown model: ${modelId}`)
  return entry[0]
}

function steps(start: number, end: number, step: number): number[] {
  const count = Math.round((end - start) / step) + 1
  return Array.from({ length: count }, (_, i) => Math.round((start + i * step) * 100) / 100)
}

function floor2(value: number): number {
  return Math.floor(value * 100) / 100
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function pct(part: number, whole: number): string {
  return whole === 0 ? '-' : `${((100 * part) / whole).toFixed(1)}%`
}

function fmt(value: number | undefined): string {
  return (value ?? 0).toFixed(3)
}
