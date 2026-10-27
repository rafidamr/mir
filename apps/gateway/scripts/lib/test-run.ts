import { createRng, NEAR_COPY_SIMILARITY, shuffle } from './dataset.ts'

/** What `npm run eval` saves: every case, with each model's answer. */
export interface TestRunAnswers {
  createdAt: string
  knowledgeBase: string
  configurations: Configuration[]
  cases: TestCase[]
}

/** One model answering on its own, with the gateway's prompt. */
export interface Configuration {
  model: string
  reasoning: string
  /** US dollars per million tokens, as the gateway records them. */
  recordedPrice: { input: number; output: number }
  /** The provider's list price, so the two models can be compared fairly. */
  listPrice: { input: number; output: number }
}

export interface TestCase {
  id: string
  message: string
  /** The right intent, or null for an off-topic message that should be refused. */
  intent: string | null
  /** The support team's reply from Bitext, or null for an off-topic message. */
  reference: string | null
  /** What the lookup found. It's the same for both models. */
  lookup: { intent: string; confidence: number; topSimilarity: number }
  /** Each model's result, by model id. */
  results: Record<string, CaseResult>
}

export interface CaseResult {
  outcome: 'answered' | 'refused' | 'failed'
  answer: string
  error: string | null
  firstWordsMs: number | null
  totalMs: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  listCostUsd: number
}

/** What `npm run grade` saves: the judge's grade for one answer. */
export interface Grade {
  caseId: string
  model: string
  /** 1 to 5. */
  score: number
  /** Whether the answer states something the reference doesn't support and could mislead. */
  madeUp: boolean
  reason: string
}

export const JUDGE = 'Claude Opus 5.5 (claude-opus-5-5), highest effort'

/** The summary of a test run, in Markdown. Grades that aren't there yet show as "not graded". */
export function summarize(run: TestRunAnswers, grades: readonly Grade[]): string {
  const real = run.cases.filter((c) => c.intent !== null)
  const offTopic = run.cases.filter((c) => c.intent === null)
  const nearCopies = real.filter((c) => c.lookup.topSimilarity >= NEAR_COPY_SIMILARITY)
  const others = real.filter((c) => c.lookup.topSimilarity < NEAR_COPY_SIMILARITY)
  const firstModel = run.configurations[0]?.model ?? ''
  const rightIntent = (cases: readonly TestCase[]) =>
    cases.filter((c) => c.lookup.intent === c.intent).length
  const refused = (cases: readonly TestCase[]) =>
    cases.filter((c) => c.results[firstModel]?.outcome === 'refused').length
  const gradeOf = (c: TestCase, model: string) =>
    grades.find((g) => g.caseId === c.id && g.model === model)

  const rows = run.configurations.map((config) => {
    const results = real.flatMap((c) => {
      const result = c.results[config.model]
      return result ? [{ c, result }] : []
    })
    const answered = results.filter((r) => r.result.outcome === 'answered')
    const graded = answered.flatMap((r) => {
      const grade = gradeOf(r.c, config.model)
      return grade ? [{ ...r, grade }] : []
    })
    const good = graded.filter((g) => g.grade.score >= 4).length
    const averageGrade = (among: readonly TestCase[]) => {
      const scores = graded.filter((g) => among.includes(g.c)).map((g) => g.grade.score)
      return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '–'
    }
    const listTotal = answered.reduce((sum, r) => sum + r.result.listCostUsd, 0)
    const recordedTotal = answered.reduce((sum, r) => sum + r.result.costUsd, 0)
    const first = answered.flatMap((r) =>
      r.result.firstWordsMs === null ? [] : [r.result.firstWordsMs],
    )
    const whole = answered.flatMap((r) => (r.result.totalMs === null ? [] : [r.result.totalMs]))
    const allGraded = graded.length === answered.length
    return {
      config,
      cells: [
        `${answered.length} of ${real.length}`,
        String(results.filter((r) => r.result.outcome === 'failed').length),
        allGraded ? averageGrade(real) : `${graded.length} of ${answered.length} graded`,
        averageGrade(nearCopies),
        averageGrade(others),
        `${good} of ${graded.length}`,
        String(graded.filter((g) => g.grade.madeUp).length),
        `${seconds(median(first))} / ${seconds(Math.max(...first))}`,
        `${seconds(median(whole))} / ${seconds(Math.max(...whole))}`,
        `${average(answered.map((r) => r.result.inputTokens))} / ${average(answered.map((r) => r.result.outputTokens))}`,
        usd(answered.length ? recordedTotal / answered.length : 0),
        usd(answered.length ? listTotal / answered.length : 0),
        good ? usd(listTotal / good) : '–',
        usd(listTotal),
      ],
    }
  })
  const labels = [
    'Answered',
    'Failed',
    'Average grade (1 to 5)',
    '… on near-copies',
    '… on the rest',
    'Graded 4 or 5',
    'Made something up',
    'First words, median / slowest',
    'Whole answer, median / slowest',
    'Tokens per answer, in / out (average)',
    'Cost per answer, as recorded',
    'Cost per answer, at list price',
    'Cost per good answer (graded 4 or 5), at list price',
    'Total cost of the answers, at list price',
  ]

  const low = run.configurations.flatMap((config) =>
    real.flatMap((c) => {
      const grade = gradeOf(c, config.model)
      return grade && grade.score <= 3 ? [{ c, config, grade }] : []
    }),
  )
  const toCheck = shuffle(
    real.flatMap((c) =>
      run.configurations.flatMap((config) => {
        const grade = gradeOf(c, config.model)
        const result = c.results[config.model]
        return grade && result ? [{ c, config, grade, result }] : []
      }),
    ),
    createRng(10),
  ).slice(0, 10)

  return [
    '# Test run',
    '',
    `Run on ${run.createdAt.slice(0, 10)} with knowledge base \`${run.knowledgeBase}\`. ${real.length} test questions and ${offTopic.length} off-topic test messages, none of them used for tuning. Each model answers on its own, with the gateway's prompt and no fallback. The answers are graded by ${JUDGE} against the support team's reply from Bitext, without being told which model wrote them.`,
    '',
    '## The two configurations',
    '',
    '| Model | Thinking | Recorded price, in / out | List price, in / out |',
    '|---|---|---|---|',
    ...run.configurations.map(
      (c) => `| ${c.model} | ${c.reasoning} | ${price(c.recordedPrice)} | ${price(c.listPrice)} |`,
    ),
    '',
    'Prices are US dollars per million tokens. Gemini is recorded at $0 because it runs on the free tier.',
    '',
    '## Intent and refusals (the same for both models)',
    '',
    `The lookup picks the intent, and decides whether to refuse, before any model is called. A near-copy is a test question whose closest knowledge-base question has a similarity of ${NEAR_COPY_SIMILARITY} or more.`,
    '',
    '| | Near-copies | The rest | All |',
    '|---|---|---|---|',
    `| Test questions | ${nearCopies.length} | ${others.length} | ${real.length} |`,
    `| Intent right | ${rightIntent(nearCopies)} | ${rightIntent(others)} | ${rightIntent(real)} (${percent(rightIntent(real), real.length)}) |`,
    `| Refused by mistake | ${refused(nearCopies)} | ${refused(others)} | ${refused(real)} |`,
    '',
    `Off-topic messages refused: ${refused(offTopic)} of ${offTopic.length}.`,
    '',
    'On the 270 practice questions the intent was right 98.1% of the time (see `vote-benchmark-bge-small.md`).',
    '',
    '## Results',
    '',
    `| | ${rows.map((r) => r.config.model).join(' | ')} |`,
    `|---|${rows.map(() => '---').join('|')}|`,
    ...labels.map((label, i) => `| ${label} | ${rows.map((r) => r.cells[i]).join(' | ')} |`),
    '',
    "Speed and cost cover the answered test questions. Times are measured inside the gateway code, so they leave out the network. Speed also depends on each provider's load at the time of the run, and Gemini runs on Google's free tier.",
    '',
    '## Answers graded 3 or lower',
    '',
    ...(low.length
      ? low.map(
          ({ c, config, grade }) =>
            `- **${grade.score}**, ${config.model}, "${c.message}": ${grade.reason}`,
        )
      : ['None yet.']),
    '',
    '## For checking by hand',
    '',
    '10 graded answers picked at random. For each, note whether you agree with the grade.',
    '',
    ...toCheck.flatMap(({ c, config, grade, result }, i) => [
      `### ${i + 1}. ${c.id}, ${config.model}`,
      '',
      `**Customer:** ${c.message}`,
      '',
      `**Answer:** ${oneLine(result.answer)}`,
      '',
      `**Reference (start):** ${oneLine(c.reference ?? '').slice(0, 300)}…`,
      '',
      `**Grade:** ${grade.score}${grade.madeUp ? ', made something up' : ''}. ${grade.reason}`,
      '',
      '**You agree:** yes / no',
      '',
    ]),
  ].join('\n')
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

function average(values: readonly number[]): string {
  return values.length ? String(Math.round(values.reduce((a, b) => a + b, 0) / values.length)) : '–'
}

function seconds(ms: number): string {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '–'
}

function usd(dollars: number): string {
  return dollars === 0 ? '$0' : `$${dollars.toPrecision(2)}`
}

function price({ input, output }: { input: number; output: number }): string {
  return `$${input} / $${output}`
}

function percent(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : '–'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
