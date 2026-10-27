'use client'

import { type KeyboardEvent, type SubmitEvent, useState } from 'react'
import Markdown from 'react-markdown'

/** The gateway's off-topic cut-off */
const SIMILARITY_CUTOFF = 0.75

interface Details {
  intent: string
  confidence: number
  matches: Array<{ id: string; question: string; intent: string; similarity: number }>
}

interface Done {
  id: string
  outcome: 'answered' | 'refused' | 'failed'
  model: string | null
  fallbackReason: string | null
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  latencyMs: number
}

export function Chat({ tenants }: { tenants: Array<{ id: string; maskedKey: string }> }) {
  const [tenant, setTenant] = useState(tenants[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [details, setDetails] = useState<Details | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (message === '' || busy) return
    setQuestion(message)
    setDraft('')
    setBusy(true)
    setAnswer('')
    setDetails(null)
    setDone(null)
    setError(null)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, message }),
      })
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setError(body?.error?.message ?? `The request failed (HTTP ${response.status}).`)
        return
      }
      for await (const { event, data } of readEvents(response.body)) {
        if (event === 'details') setDetails(data as Details)
        if (event === 'text') setAnswer((text) => text + (data as { text: string }).text)
        if (event === 'error') setError((data as { message: string }).message)
        if (event === 'done') setDone(data as Done)
      }
    } catch {
      setError('The connection broke off.')
    } finally {
      setBusy(false)
    }
  }

  /** Enter sends the message; Shift+Enter starts a new line. */
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const started = question !== null
  const composer = (
    <form className={started ? 'composer slim' : 'composer'} onSubmit={send}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={sendOnEnter}
        maxLength={2000}
        rows={started ? 1 : 2}
        placeholder={started ? 'Enter a new message...' : 'How can I help you?'}
        aria-label="Customer message"
      />
      <button
        type="submit"
        className={started ? 'send slim' : 'send'}
        disabled={busy || draft.trim() === ''}
        aria-label="Send"
      >
        {started ? <ReturnIcon /> : <ArrowUpIcon />}
      </button>
    </form>
  )
  const picker = (
    <label className="picker">
      <span>
        <KeyIcon /> Choose a tenant API key
      </span>
      <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.maskedKey} ({t.id})
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="chat">
      <section className={started ? 'conversation' : 'conversation empty'}>
        {started ? (
          <>
            <div className="thread">
              <p className="question">{question}</p>
              {error && <p className="error">{error}</p>}
              <div className="answer">
                <Markdown
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {answer}
                </Markdown>
                {busy && answer === '' && <p className="muted">Thinking…</p>}
              </div>
            </div>
            <div className="dock">
              {composer}
              {picker}
            </div>
          </>
        ) : (
          <div className="welcome">
            <h1>How can I help you?</h1>
            {composer}
            {picker}
          </div>
        )}
      </section>

      <aside className="details">
        <h2>Details</h2>
        <dl>
          <dt>Outcome</dt>
          <dd>{done && <code className={`outcome ${done.outcome}`}>{done.outcome}</code>}</dd>
          <dt>Model</dt>
          <dd>
            {done &&
              (done.model ? (
                <code className="box">{done.model}</code>
              ) : (
                <span className="muted">none (no model was called)</span>
              ))}
          </dd>
          <dt>Switched models</dt>
          <dd>
            {done &&
              (done.fallbackReason ? (
                <code className="box warn">{done.fallbackReason}</code>
              ) : (
                <code>no</code>
              ))}
          </dd>
          <dt>Intent</dt>
          <dd>
            {details && (
              <>
                <code>{details.intent}</code>
                <small>(confidence {details.confidence.toFixed(2)})</small>
              </>
            )}
          </dd>
          <dt>Tokens</dt>
          <dd>
            {done && (
              <code>
                {done.inputTokens ?? 0} in / {done.outputTokens ?? 0} out
              </code>
            )}
          </dd>
          <dt>Latency</dt>
          <dd>{done && <code>{done.latencyMs} ms</code>}</dd>
          <dt>Cost</dt>
          <dd>{done && <code className="cost">${(done.costUsd ?? 0).toFixed(6)}</code>}</dd>
        </dl>
        <h3>Matched questions</h3>
        <table className="matches">
          <thead>
            <tr>
              <th>Question</th>
              <th>Intent</th>
              <th>Similarity</th>
            </tr>
          </thead>
          <tbody>
            {details?.matches.map((m) => (
              <tr key={m.id}>
                <td>{m.question}</td>
                <td>
                  <code className="intent">{m.intent}</code>
                </td>
                <td>
                  <code className={m.similarity >= SIMILARITY_CUTOFF ? 'ok' : 'low'}>
                    {m.similarity.toFixed(3)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  )
}

/** Reads server-sent events: blocks separated by a blank line, each with "event:" and "data:" lines. */
async function* readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end < 0) break
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = block.match(/^event: (.*)$/m)?.[1]
      const data = block.match(/^data: (.*)$/m)?.[1]
      if (event && data) yield { event, data: JSON.parse(data) as unknown }
    }
  }
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 19V5M5 12l7-7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ReturnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M10.7 12.3 20 3m-3 3 3 3m-6 0 2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
