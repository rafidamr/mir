/**
 * Calls the real models: one sample answer each, then 10 practice questions each, timing how long
 * the first words take. Uses the keys and model settings in .env.
 *
 *   npm run live-check
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../src/config.ts'
import { parseJsonl } from '../src/lib/jsonl.ts'
import { createLLMClients } from '../src/router/llm-clients.ts'
import { costOf } from '../src/router/router.ts'
import type { LLMClient, Tokens } from '../src/router/types.ts'
import type { BitextRow } from './lib/dataset.ts'
import { paths } from './lib/paths.ts'

const INSTRUCTIONS =
  'You are a customer support assistant. Reply to the customer in two or three short sentences.'

const models = createLLMClients(loadConfig())
const questions = parseJsonl<BitextRow>(
  await readFile(path.join(paths.evalDir, 'practice.jsonl'), 'utf8'),
)
  .slice(0, 10)
  .map((row) => row.instruction)

for (const model of models) {
  console.log(`\n${model.id}`)
  try {
    const sample = await ask(model, 'I want to cancel my order. How do I do that?')
    console.log(`  first words after ${sample.firstWordsMs} ms`)
    console.log(
      `  tokens: ${sample.tokens.inputTokens} in, ${sample.tokens.outputTokens} out (thinking included); cost $${costOf(model.cost, sample.tokens).costUsd}`,
    )
    console.log(`  answer: ${sample.text.slice(0, 200).replace(/\s+/g, ' ')}`)

    const times: number[] = []
    for (const question of questions) times.push((await ask(model, question)).firstWordsMs)
    times.sort((a, b) => a - b)
    console.log(
      `  first words over ${times.length} practice questions: middle ${times[Math.floor(times.length / 2)]} ms, slowest ${times.at(-1)} ms`,
    )
  } catch (error) {
    console.log(`  failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function ask(model: LLMClient, question: string) {
  const started = performance.now()
  let firstWordsMs = 0
  let text = ''
  let tokens: Tokens = { inputTokens: 0, outputTokens: 0 }
  const prompt = { instructions: INSTRUCTIONS, message: question }
  for await (const event of model.call(prompt, new AbortController().signal)) {
    if (event.type === 'text') {
      if (!text) firstWordsMs = Math.round(performance.now() - started)
      text += event.text
    } else {
      tokens = event
    }
  }
  return { text, firstWordsMs, tokens }
}
