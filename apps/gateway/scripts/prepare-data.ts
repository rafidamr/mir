/**
 * Builds the knowledge base and the question sets from the Bitext dataset.
 *
 *   npm run data:prepare
 *
 * Downloads the CSV once, drops duplicate questions, splits the rest into knowledge base /
 * practice / test with a fixed seed, turns the knowledge-base questions into vectors, and writes
 * everything to data/. Re-running gives the same split.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { createEmbedder, EMBEDDING_MODELS } from '../src/assistant/embedder.ts'
import {
  createKnowledgeBase,
  type KbEntry,
  type KbManifest,
} from '../src/assistant/knowledge-base.ts'
import { toJsonl } from '../src/lib/jsonl.ts'
import {
  type BitextRow,
  type DatasetSplit,
  dedupeQuestions,
  NEAR_COPY_SIMILARITY,
  splitByIntent,
} from './lib/dataset.ts'
import { embedInBatches, flatten } from './lib/embed.ts'
import { paths } from './lib/paths.ts'

const SOURCE_URL =
  'https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset/resolve/main/Bitext_Sample_Customer_Support_Training_Dataset_27K_responses-v11.csv'
const SEED = 42
const SIZES = { knowledgeBase: 2000, practicePerIntent: 10, test: 30 }
const EMBEDDING = EMBEDDING_MODELS['bge-small']

const csv = await downloadOnce(SOURCE_URL, paths.rawCsv)
const rows = parseBitext(csv)
const unique = dedupeQuestions(rows)
const split = splitByIntent(unique, SIZES, SEED)
console.log(
  `Read ${rows.length} rows (${countIntents(rows)} intents). ${rows.length - unique.length} duplicate questions removed.`,
)
console.log(
  `Split: ${split.knowledgeBase.length} knowledge base, ${split.practice.length} practice, ${split.test.length} test.`,
)

const entries: KbEntry[] = split.knowledgeBase.map(
  ({ id, intent, category, instruction, response }) => ({
    id,
    intent,
    category,
    instruction,
    response,
  }),
)
const embedder = await createEmbedder(EMBEDDING, { cacheDir: paths.modelCache })
const vectors = flatten(
  await embedInBatches(
    embedder,
    entries.map((e) => e.instruction),
    'knowledge base',
  ),
  embedder.dimensions,
)

// How close is each test question to its nearest knowledge-base question? Many near-copies
// would make the test run look better than real traffic would.
const kb = createKnowledgeBase(entries, vectors, embedder.dimensions)
const testVectors = await embedInBatches(
  embedder,
  split.test.map((r) => r.instruction),
  'test questions',
)
const closest = testVectors.map((v) => kb.search(v, 1)[0]?.similarity ?? 0).sort((a, b) => a - b)

const kbJsonl = toJsonl(entries)
const vectorBytes = Buffer.from(vectors.buffer)
const manifest: KbManifest & Record<string, unknown> = {
  version: `kb-${sha256(kbJsonl + EMBEDDING.id).slice(0, 8)}`,
  count: entries.length,
  embedding: {
    model: EMBEDDING.id,
    pooling: EMBEDDING.pooling,
    dtype: EMBEDDING.dtype,
    dimensions: embedder.dimensions,
  },
  byteOrder: 'little-endian',
  seed: SEED,
  sizes: {
    knowledgeBase: split.knowledgeBase.length,
    practice: split.practice.length,
    test: split.test.length,
  },
  source: {
    url: SOURCE_URL,
    sha256: sha256(csv),
    rows: rows.length,
    uniqueQuestions: unique.length,
  },
  files: { 'kb.jsonl': sha256(kbJsonl), 'embeddings.f32': sha256(vectorBytes) },
}

await mkdir(paths.kbDir, { recursive: true })
await mkdir(paths.evalDir, { recursive: true })
await writeFile(path.join(paths.kbDir, 'kb.jsonl'), kbJsonl)
await writeFile(path.join(paths.kbDir, 'embeddings.f32'), vectorBytes)
await writeFile(path.join(paths.kbDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(paths.evalDir, 'practice.jsonl'), toJsonl(split.practice))
await writeFile(path.join(paths.evalDir, 'test.jsonl'), toJsonl(split.test))
await writeFile(
  path.join(paths.evalDir, 'split-report.md'),
  splitReport(rows.length, unique.length, split, closest),
)
console.log(`Wrote data/kb (version ${manifest.version}) and data/eval.`)

async function downloadOnce(url: string, file: string): Promise<string> {
  if (!existsSync(file)) {
    console.log(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, Buffer.from(await response.arrayBuffer()))
  }
  return readFile(file, 'utf8')
}

function parseBitext(text: string): BitextRow[] {
  const records: Record<string, string | undefined>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
  })
  return records.map((record, index) => {
    const { flags, instruction, category, intent, response } = record
    if (!instruction?.trim() || !category || !intent || !response?.trim()) {
      throw new Error(`Row ${index + 2} of the CSV is missing a field`)
    }
    return {
      id: `bitext-${String(index).padStart(5, '0')}`,
      flags: flags ?? '',
      instruction: instruction.trim(),
      category,
      intent,
      response: response.trim(),
    }
  })
}

function countIntents(list: readonly BitextRow[]): number {
  return new Set(list.map((r) => r.intent)).size
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function splitReport(
  sourceRows: number,
  uniqueRows: number,
  { knowledgeBase, practice, test }: DatasetSplit,
  testCloseness: readonly number[],
): string {
  const count = (list: readonly BitextRow[], intent: string) =>
    list.filter((r) => r.intent === intent).length
  const intents = [...new Set(knowledgeBase.map((r) => r.intent))].sort()
  const used = knowledgeBase.length + practice.length + test.length
  const middle = testCloseness[Math.floor(testCloseness.length / 2)] ?? 0
  const nearCopies = testCloseness.filter((s) => s >= NEAR_COPY_SIMILARITY).length
  return [
    '# Data split report',
    '',
    `Made by \`npm run data:prepare\` with seed ${SEED}. Source: the Bitext customer support dataset (CDLA-Sharing-1.0).`,
    '',
    '| Step | Questions |',
    '|---|---|',
    `| In the source file | ${sourceRows} |`,
    `| Duplicates removed | ${sourceRows - uniqueRows} |`,
    `| Knowledge base | ${knowledgeBase.length} |`,
    `| Practice | ${practice.length} |`,
    `| Test | ${test.length} |`,
    `| Not used | ${uniqueRows - used} |`,
    '',
    '## Per intent',
    '',
    '| Intent | Knowledge base | Practice | Test |',
    '|---|---|---|---|',
    ...intents.map(
      (i) => `| ${i} | ${count(knowledgeBase, i)} | ${count(practice, i)} | ${count(test, i)} |`,
    ),
    '',
    '## Are test questions near-copies of knowledge-base questions?',
    '',
    'For each test question, the similarity (0 to 1) to its closest knowledge-base question:',
    '',
    `- lowest ${fmt(testCloseness[0])}, middle ${fmt(middle)}, highest ${fmt(testCloseness.at(-1))}`,
    `- ${nearCopies} of ${testCloseness.length} are at or above ${NEAR_COPY_SIMILARITY} (near-copies)`,
    '',
  ].join('\n')
}

function fmt(value: number | undefined): string {
  return (value ?? 0).toFixed(3)
}
