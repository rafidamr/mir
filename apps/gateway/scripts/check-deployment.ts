/**
 * Checks the live gateway, and the console when its URL is given, after a deploy. Uses the live
 * keys in .cache/live-keys.txt and the model settings in .env.production. Each run uses 3 of
 * tenant1's requests (2 without the console) and 1 of tenant2's.
 *
 *   npm run check-deployment -- <gateway URL> [console URL]
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../src/config.ts'
import { paths } from './lib/paths.ts'

interface Done {
  id: string
  outcome: string
  model: string | null
  fallbackReason: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

const [gatewayUrl, consoleUrl] = process.argv.slice(2).map((url) => url.replace(/\/$/, ''))
if (!gatewayUrl) {
  console.error('Usage: npm run check-deployment -- <gateway URL> [console URL]')
  process.exit(1)
}

const config = loadConfig()
const noTrainingModels = [config.GEMINI_MODEL, config.OPENROUTER_MODEL]
  .filter((model) => !model.training_allowed)
  .map((model) => model.id)
const keys: Record<string, string> = Object.fromEntries(
  (await readFile(path.join(paths.repoRoot, '.cache', 'live-keys.txt'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/)),
)
let failures = 0

console.log(`Gateway: ${gatewayUrl}`)
const noKey = await fetch(`${gatewayUrl}/v1/assistant`, { method: 'POST' })
check('a request without an API key is refused', noKey.status === 401, `HTTP ${noKey.status}`)

const tooLong = await askGateway('tenant1', 'a'.repeat(201))
check('a 201-character message is refused', tooLong.status === 400, `HTTP ${tooLong.status}`)

const support = await askGateway('tenant1', 'I want to cancel my order')
check(
  'a support question is answered',
  support.done?.outcome === 'answered',
  describe(support.done),
)

const offTopic = await askGateway('tenant1', "What's the weather like in Jakarta today?")
check(
  'an off-topic question is refused without calling a model',
  offTopic.done?.outcome === 'refused' && offTopic.done.model === null,
  describe(offTopic.done),
)

const noTraining = await askGateway('tenant2', 'How can I track my order?')
check(
  'tenant2 is answered by a model that does not train on data',
  noTraining.done?.outcome === 'answered' && noTrainingModels.includes(noTraining.done.model ?? ''),
  describe(noTraining.done),
)

const overQuota = await askGateway('tenant3', 'I want to cancel my order')
check('tenant3 is refused, its quota used up', overQuota.status === 429, `HTTP ${overQuota.status}`)

const usage = (await (
  await fetch(`${gatewayUrl}/v1/usage`, { headers: { authorization: `Bearer ${keys.tenant1}` } })
).json()) as { recent: Array<{ id: string }> }
const recorded = usage.recent.map((row) => row.id)
check(
  'the usage endpoint lists the requests just made',
  [support.done, offTopic.done].every((done) => done && recorded.includes(done.id)),
)

if (consoleUrl) {
  console.log(`\nConsole: ${consoleUrl}`)
  for (const page of ['/', '/usage']) {
    const response = await fetch(`${consoleUrl}${page}`)
    const html = await response.text()
    const leaked = Object.values(keys).some((key) => html.includes(key))
    check(
      `the ${page} page loads without showing a full key`,
      response.ok && !leaked,
      `HTTP ${response.status}${leaked ? ', a full key is in the page' : ''}`,
    )
  }
  const viaConsole = await readAnswer(
    await fetch(`${consoleUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 'tenant1', message: 'I want to cancel my order' }),
    }),
  )
  check(
    'a question sent through the console is answered',
    viaConsole.done?.outcome === 'answered',
    describe(viaConsole.done),
  )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1

function check(name: string, passed: boolean, detail?: string) {
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`)
  if (!passed) failures++
}

async function askGateway(tenant: string, message: string) {
  return readAnswer(
    await fetch(`${gatewayUrl}/v1/assistant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${keys[tenant]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    }),
  )
}

/** Reads the streamed events to the end and keeps the last one, `done`, if it came. */
async function readAnswer(response: Response) {
  const done = (await response.text())
    .split('\n\n')
    .find((block) => /^event: done$/m.test(block))
    ?.match(/^data: (.*)$/m)?.[1]
  return { status: response.status, done: done ? (JSON.parse(done) as Done) : undefined }
}

function describe(done?: Done): string {
  if (!done) return 'no answer'
  const switched = done.fallbackReason ? `, switched: ${done.fallbackReason}` : ''
  return `${done.model ?? 'no model'}, ${done.inputTokens} in / ${done.outputTokens} out tokens, $${done.costUsd}, ${done.latencyMs} ms${switched}`
}
