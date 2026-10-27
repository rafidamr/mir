/**
 * The test run: the 30 test questions and 6 off-topic test messages, answered by each model on its
 * own through the gateway's own assistant and router code. Saves every answer and writes the
 * summary; `npm run grade` then grades the answers. Uses the keys and model settings in .env.
 *
 *   npm run eval
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createAssistant, type Details } from '../src/assistant/assistant.ts'
import { createEmbedder } from '../src/assistant/embedder.ts'
import { loadKnowledgeBase } from '../src/assistant/knowledge-base.ts'
import { loadConfig } from '../src/config.ts'
import type { Tenant } from '../src/db/schema.ts'
import { parseJsonl } from '../src/lib/jsonl.ts'
import { createLLMClients } from '../src/router/llm-clients.ts'
import { costOf, createRouter } from '../src/router/router.ts'
import type { LLMClient } from '../src/router/types.ts'
import type { BitextRow } from './lib/dataset.ts'
import { paths } from './lib/paths.ts'
import { type CaseResult, summarize, type TestCase, type TestRunAnswers } from './lib/test-run.ts'

/** List prices in US dollars per million tokens, from OpenRouter on 2026-10-27. */
const LIST_PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'openai/gpt-6-luna': { input: 0.1, output: 0.5 },
}
/** Gemini's free tier allows 15 requests a minute. */
const MS_BETWEEN_QUESTIONS = 4500
const MS_BEFORE_RETRY = 30_000

const config = loadConfig()
const { kb, manifest } = await loadKnowledgeBase(paths.kbDir)
const { model, pooling, dtype } = manifest.embedding
const embedder = await createEmbedder({ id: model, pooling, dtype }, { cacheDir: paths.modelCache })
const clients = createLLMClients(config)
const reasoningOf: Record<string, string> = {
  [config.GEMINI_MODEL.id]: config.GEMINI_MODEL.reasoning,
  [config.OPENROUTER_MODEL.id]: config.OPENROUTER_MODEL.reasoning,
}
// Like the eval tenant: it allows training, so both models may serve it.
const tenant: Tenant = {
  id: 'eval',
  name: 'Evaluation',
  apiKeyHash: '',
  allowsTraining: true,
  requestQuota: 0,
  requestsUsed: 0,
}

const testRows = parseJsonl<BitextRow>(
  await readFile(path.join(paths.evalDir, 'test.jsonl'), 'utf8'),
)
const offTopic = (
  JSON.parse(await readFile(path.join(paths.evalDir, 'offtopic.json'), 'utf8')) as {
    test: string[]
  }
).test
const inputs = [
  ...testRows.map((row) => ({
    id: row.id,
    message: row.instruction,
    intent: row.intent as string | null,
    reference: row.response as string | null,
  })),
  ...offTopic.map((message, i) => ({
    id: `offtopic-${i + 1}`,
    message,
    intent: null,
    reference: null,
  })),
]

// The lookup doesn't depend on the model, so it runs once per case.
const lookup = createAssistant({ kb, embedder, router: createRouter({ llmClients: [] }) })
const cases: Array<TestCase & { details: Details }> = []
for (const input of inputs) {
  const details = await lookup.lookUp(input.message)
  const topSimilarity = details.matches[0]?.similarity ?? 0
  const { intent, confidence } = details
  cases.push({ ...input, lookup: { intent, confidence, topSimilarity }, results: {}, details })
}

let lastQuestionAt = 0
for (const client of clients) {
  console.log(`\n${client.id}`)
  for (const testCase of cases) {
    const result = await answer(client, testCase)
    testCase.results[client.id] = result
    const time = result.firstWordsMs === null ? '' : ` (first words ${result.firstWordsMs} ms)`
    console.log(
      `  ${result.outcome.padEnd(8)} ${testCase.id}${time}${result.error ? `: ${result.error}` : ''}`,
    )
  }
}

const run: TestRunAnswers = {
  createdAt: new Date().toISOString(),
  knowledgeBase: manifest.version,
  configurations: clients.map((client) => ({
    model: client.id,
    reasoning: reasoningOf[client.id] ?? 'unknown',
    recordedPrice: client.cost,
    listPrice: LIST_PRICES[client.id] ?? client.cost,
  })),
  cases: cases.map(({ details: _, ...testCase }) => testCase),
}
await mkdir(paths.resultsDir, { recursive: true })
await writeFile(
  path.join(paths.resultsDir, 'test-run-answers.json'),
  `${JSON.stringify(run, null, 2)}\n`,
)
// Grades of earlier answers don't apply to these ones.
await writeFile(path.join(paths.resultsDir, 'test-run-grades.json'), '[]\n')
await writeFile(path.join(paths.resultsDir, 'test-run.md'), `${summarize(run, [])}\n`)
console.log('\nSaved eval/results/test-run-answers.json and test-run.md. Next: npm run grade')

/** One model answers one case, waiting its turn first. A rate limit gets one retry. */
async function answer(
  client: LLMClient,
  testCase: TestCase & { details: Details },
): Promise<CaseResult> {
  for (let attempt = 1; ; attempt++) {
    await waitTurn()
    // A new router each time, so a failure doesn't make it skip the model for the next cases.
    const assistant = createAssistant({
      kb,
      embedder,
      router: createRouter({ llmClients: [client] }),
    })
    const started = performance.now()
    try {
      const reply = await assistant.answer(
        testCase.message,
        testCase.details,
        tenant,
        new AbortController().signal,
      )
      let text = ''
      let firstWordsMs: number | null = null
      for await (const piece of reply.text) {
        firstWordsMs ??= Math.round(performance.now() - started)
        text += piece
      }
      const usage = reply.usage()
      const listPrice = LIST_PRICES[client.id] ?? client.cost
      return {
        outcome: reply.outcome,
        answer: text,
        error: null,
        firstWordsMs,
        totalMs: Math.round(performance.now() - started),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        listCostUsd: costOf(listPrice, usage).costUsd,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/per ?day/i.test(message)) {
        console.error(
          `\nStopped: ${client.id} hit its daily limit. Swap in a new key and run again.`,
        )
        console.error(message)
        process.exit(1)
      }
      if (attempt === 1 && /quota|rate limit|429/i.test(message)) {
        console.log(`  rate limited on ${testCase.id}, trying again in ${MS_BEFORE_RETRY / 1000} s`)
        await new Promise((resolve) => setTimeout(resolve, MS_BEFORE_RETRY))
        continue
      }
      return {
        outcome: 'failed',
        answer: '',
        error: message,
        firstWordsMs: null,
        totalMs: null,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        listCostUsd: 0,
      }
    }
  }
}

/** Waits until enough time has passed since the last question. */
async function waitTurn() {
  const wait = lastQuestionAt + MS_BETWEEN_QUESTIONS - performance.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastQuestionAt = performance.now()
}
