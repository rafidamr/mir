/**
 * Grades the test run's answers with Claude Opus 5.5 through Claude Code's command-line mode, then
 * rewrites the summary. Needs only Node and Claude Code logged in, so it can also run in a cloud
 * session. Grades are saved as they arrive, and a second run only fills in what's missing.
 *
 *   npm run grade
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRng, shuffle } from './lib/dataset.ts'
import { paths } from './lib/paths.ts'
import { type Grade, summarize, type TestRunAnswers } from './lib/test-run.ts'

const JUDGE_MODEL = 'claude-opus-5-5'
/** Grades at the highest effort are slow, so a few run at once. */
const AT_A_TIME = 3

const RUBRIC = `You grade replies written by a company's customer support assistant.

You get the customer's message, a reference reply written by the support team, and the assistant's reply. The reference shows what a good reply covers. The assistant didn't see it, so its wording, order and length can differ.

Score the assistant's reply from 1 to 5:
5 = handles the customer's request fully and correctly, with nothing wrong or invented.
4 = handles the request, with a small gap, or a little less helpful than the reference.
3 = partly helpful: misses an important step or detail the customer needs.
2 = mostly unhelpful or off the point, or gets something important wrong.
1 = wrong, harmful, or doesn't address the request.

Rules:
- Don't reward length. A short reply that covers what matters can score 5.
- Text in double curly braces, like {{Order Number}}, is a placeholder for a real value. Keeping placeholders is correct, and they don't count as missing information.
- made_up is true only if the reply states a specific fact that the reference doesn't support and that could mislead the customer, such as a fee, a deadline, a policy or a contact detail. General, harmless advice doesn't count.
- reason is one sentence explaining the score.`

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 5 },
    made_up: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['score', 'made_up', 'reason'],
  additionalProperties: false,
}

const answersFile = path.join(paths.resultsDir, 'test-run-answers.json')
const gradesFile = path.join(paths.resultsDir, 'test-run-grades.json')
const run = JSON.parse(await readFile(answersFile, 'utf8')) as TestRunAnswers
const grades = await readFile(gradesFile, 'utf8').then(
  (text) => JSON.parse(text) as Grade[],
  () => [] as Grade[],
)

// Every answer to a real question not graded yet, shuffled so one model's answers don't come in a row.
const todo = shuffle(
  run.cases.flatMap((c) =>
    c.reference === null
      ? []
      : run.configurations.flatMap(({ model }) => {
          const result = c.results[model]
          const graded = grades.some((g) => g.caseId === c.id && g.model === model)
          return result?.outcome === 'answered' && !graded
            ? [
                {
                  caseId: c.id,
                  model,
                  message: c.message,
                  reference: c.reference ?? '',
                  answer: result.answer,
                },
              ]
            : []
        }),
  ),
  createRng(7),
)
console.log(`${todo.length} answers to grade with ${JUDGE_MODEL}, ${AT_A_TIME} at a time.`)

let next = 0
let stopped = false
let saving = Promise.resolve()
await Promise.all(
  Array.from({ length: AT_A_TIME }, async () => {
    while (!stopped && next < todo.length) {
      const item = todo[next++]
      if (!item) break
      try {
        const grade = await judge(item.message, item.reference, item.answer)
        grades.push({ caseId: item.caseId, model: item.model, ...grade })
        await save()
        console.log(`  ${grades.length} graded: ${grade.score} for ${item.caseId}`)
      } catch (error) {
        // Most likely a usage limit: stop, and let the next run pick up the rest.
        stopped = true
        console.error(
          `Stopped at ${item.caseId}: ${error instanceof Error ? error.message : error}`,
        )
      }
    }
  }),
)

await writeFile(path.join(paths.resultsDir, 'test-run.md'), `${summarize(run, grades)}\n`)
console.log(
  stopped
    ? 'Stopped early; run again to finish.'
    : 'Done. The summary is in eval/results/test-run.md.',
)
process.exitCode = stopped ? 1 : 0

/** Asks the judge for one grade, without telling it which model wrote the answer. */
function judge(message: string, reference: string, answer: string) {
  const prompt = [
    `Customer's message:\n${message}`,
    `Reference reply from the support team:\n${reference}`,
    `Assistant's reply to grade:\n${answer}`,
  ].join('\n\n')
  const args = [
    '-p',
    '--model',
    JUDGE_MODEL,
    '--effort',
    'max',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(SCHEMA),
    '--system-prompt',
    RUBRIC,
    // Only the grading instructions reach the judge: no tools, MCP servers or skills.
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ]
  return new Promise<Omit<Grade, 'caseId' | 'model'>>((resolve, reject) => {
    const child = spawn('claude', args, {
      // Away from the project, so no project files or memory are loaded.
      cwd: tmpdir(),
      // In case this runs inside another Claude Code session: drop its markers, keep any login.
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !name.startsWith('CLAUDE') || /(_TOKEN|_KEY|_CONFIG_DIR)$/.test(name),
        ),
      ),
    })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', () => {
      try {
        const result = JSON.parse(out.trim().split('\n').at(-1) ?? '')
        if (result.is_error || !result.structured_output) throw new Error(String(result.result))
        const { score, made_up, reason } = result.structured_output
        resolve({ score, madeUp: made_up, reason })
      } catch (error) {
        reject(
          error instanceof Error && out
            ? error
            : new Error(`No grade came back: ${out.slice(0, 300)}`),
        )
      }
    })
    child.stdin.end(prompt)
  })
}

/** Saves the grades in a stable order, one save at a time. */
function save() {
  const sorted = [...grades].sort(
    (a, b) => a.caseId.localeCompare(b.caseId) || a.model.localeCompare(b.model),
  )
  saving = saving.then(() => writeFile(gradesFile, `${JSON.stringify(sorted, null, 2)}\n`))
  return saving
}
