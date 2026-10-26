'use client'

import { type SubmitEvent, useState } from 'react'

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
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState('')
  const [details, setDetails] = useState<Details | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
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

  return (
    <div className="chat">
      <section>
        <form onSubmit={send}>
          <label>
            Choose a tenant API key:
            <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.maskedKey} ({t.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            Customer message:
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="For example: I want to cancel the order I placed yesterday"
            />
          </label>
          <button type="submit" disabled={busy || message.trim() === ''}>
            {busy ? 'Answering…' : 'Send'}
          </button>
        </form>
        <h2>Answer</h2>
        <div className="answer">{answer || (busy ? '…' : '')}</div>
        {error && <p className="error">{error}</p>}
      </section>

      <aside>
        <h2>Details</h2>
        <dl>
          <dt>Outcome</dt>
          <dd>{done?.outcome ?? '—'}</dd>
          <dt>Model</dt>
          <dd>{done ? (done.model ?? 'none (no model was called)') : '—'}</dd>
          <dt>Switched models</dt>
          <dd>{done ? (done.fallbackReason ?? 'no') : '—'}</dd>
          <dt>Intent</dt>
          <dd>
            {details ? `${details.intent} (confidence ${details.confidence.toFixed(2)})` : '—'}
          </dd>
          <dt>Tokens</dt>
          <dd>{done ? `${done.inputTokens ?? 0} in / ${done.outputTokens ?? 0} out` : '—'}</dd>
          <dt>Latency</dt>
          <dd>{done ? `${done.latencyMs} ms` : '—'}</dd>
          <dt>Cost</dt>
          <dd>{done ? `$${(done.costUsd ?? 0).toFixed(6)}` : '—'}</dd>
        </dl>
        <h3>Matched questions</h3>
        <table>
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
                <td>{m.intent}</td>
                <td>{m.similarity.toFixed(3)}</td>
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
