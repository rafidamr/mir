import type { LLMClient, ModelCost, RouterRequest, RouterResponse, Tokens } from './types.ts'

export class AllModelsFailedError extends Error {}

/** How many characters are checked before anything is shown. */
const FIRST_WORDS_LENGTH = 40
const FAILURES_BEFORE_SKIP = 3
const SKIP_FOR_MS = 60_000

export function createRouter({
  llmClients,
  firstWordsTimeoutMs = 3000,
  totalTimeoutMs = 30_000,
  now = Date.now,
}: {
  /** In the order to try them. */
  llmClients: LLMClient[]
  firstWordsTimeoutMs?: number
  totalTimeoutMs?: number
  now?: () => number
}) {
  const failuresInARow = new Map<string, number>()
  const skippedUntil = new Map<string, number>()

  async function route(request: RouterRequest): Promise<RouterResponse> {
    const reasons: string[] = []
    const candidates = llmClients.filter((m) => request.allowsTraining || !m.trainingAllowed)
    for (const [index, model] of candidates.entries()) {
      if ((skippedUntil.get(model.id) ?? 0) > now()) {
        reasons.push(`${model.id}: skipped after ${FAILURES_BEFORE_SKIP} failures in a row`)
        continue
      }
      // The last model has nothing to switch to, so it isn't cut off for being slow to start.
      const isLast = index === candidates.length - 1
      try {
        const answer = await start(model, request, isLast ? totalTimeoutMs : firstWordsTimeoutMs)
        failuresInARow.delete(model.id)
        return { model: model.id, fallbackReason: reasons.join('; ') || null, ...answer }
      } catch (error) {
        reasons.push(`${model.id}: ${error instanceof Error ? error.message : String(error)}`)
        const failures = (failuresInARow.get(model.id) ?? 0) + 1
        if (failures < FAILURES_BEFORE_SKIP) {
          failuresInARow.set(model.id, failures)
        } else {
          failuresInARow.delete(model.id)
          skippedUntil.set(model.id, now() + SKIP_FOR_MS)
        }
      }
    }
    throw new AllModelsFailedError(`No model could answer. ${reasons.join('; ')}`)
  }

  /**
   * Starts the model and checks its first words. Throws if they don't arrive in time or can't be
   * used. After that the answer is handed over and can't be switched: the user is about to see it.
   */
  async function start(model: LLMClient, request: RouterRequest, timeToStartMs: number) {
    const controller = new AbortController()
    // Stops the model when either the router or the customer says so, even if the customer has
    // already left before the model starts.
    const signal = request.signal
      ? AbortSignal.any([controller.signal, request.signal])
      : controller.signal
    const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs)
    const stop = () => {
      clearTimeout(totalTimer)
      controller.abort()
    }
    const events = model.call(request.prompt, signal)[Symbol.asyncIterator]()
    let tokens: Tokens = { inputTokens: 0, outputTokens: 0 }
    let firstWords = ''
    let finished = false

    let tooSlow = false
    const firstWordsTimer = setTimeout(() => {
      tooSlow = true
      controller.abort()
    }, timeToStartMs)
    try {
      while (firstWords.length < FIRST_WORDS_LENGTH) {
        const next = await events.next()
        if (next.done) {
          finished = true
          break
        }
        if (next.value.type === 'text') firstWords += next.value.text
        else tokens = next.value
      }
    } catch (error) {
      stop()
      throw tooSlow ? new Error(`too slow: no answer within ${timeToStartMs / 1000} s`) : error
    } finally {
      clearTimeout(firstWordsTimer)
    }

    const problem = firstWords.trim() === '' ? 'empty answer' : request.doSanityCheck?.(firstWords)
    if (problem) {
      stop()
      throw new Error(problem)
    }

    async function* text() {
      try {
        yield firstWords
        while (!finished) {
          const next = await events.next()
          if (next.done) break
          if (next.value.type === 'text') yield next.value.text
          else tokens = next.value
        }
      } finally {
        stop()
      }
    }
    return { text: text(), usage: () => costOf(model.cost, tokens) }
  }

  return { route }
}

/** Tokens times the model's prices, rounded to 8 decimals like the database column. */
export function costOf(cost: ModelCost, { inputTokens, outputTokens }: Tokens) {
  const dollars = (inputTokens * cost.input + outputTokens * cost.output) / 1e6
  return { inputTokens, outputTokens, costUsd: Math.round(dollars * 1e8) / 1e8 }
}
