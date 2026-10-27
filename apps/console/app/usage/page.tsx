import { gatewayUrl, tenants } from '../../lib/tenants'

// Always show the latest numbers.
export const dynamic = 'force-dynamic'

interface RequestRow {
  id: string
  createdAt: string
  outcome: string
  model: string | null
  fallbackReason: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

interface Usage {
  quota: number
  used: number
  remaining: number
  totalCostUsd: number
  recent: RequestRow[]
}

export default async function UsagePage() {
  const all = await Promise.all(
    tenants().map(async (tenant) => ({ tenant, usage: await usageOf(tenant.key) })),
  )

  return (
    <main className="page">
      <h1>Usage</h1>
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>API key</th>
            <th>Requests used</th>
            <th>Quota</th>
            <th>Remaining</th>
            <th>Total cost</th>
          </tr>
        </thead>
        <tbody>
          {all.map(({ tenant, usage }) => (
            <tr key={tenant.id}>
              <td>{tenant.id}</td>
              <td>{tenant.maskedKey}</td>
              {typeof usage === 'string' ? (
                <td colSpan={4} className="error">
                  {usage}
                </td>
              ) : (
                <>
                  <td>{usage.used}</td>
                  <td>{usage.quota}</td>
                  <td>{usage.remaining}</td>
                  <td>${usage.totalCostUsd.toFixed(6)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {all.map(({ tenant, usage }) =>
        typeof usage === 'string' ? null : (
          <section key={tenant.id}>
            <h2>{tenant.id}: recent requests</h2>
            <table>
              <thead>
                <tr>
                  <th>Time (UTC+7)</th>
                  <th>Outcome</th>
                  <th>Model</th>
                  <th>Switched because</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{inUtcPlus7(r.createdAt)}</td>
                    <td>{r.outcome}</td>
                    <td>{r.model ?? '—'}</td>
                    <td>{r.fallbackReason ?? '—'}</td>
                    <td className="nowrap">
                      {r.inputTokens} in / {r.outputTokens} out
                    </td>
                    <td>${r.costUsd.toFixed(6)}</td>
                    <td>{r.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </main>
  )
}

/** A time in UTC+7 (WIB). */
function inUtcPlus7(iso: string): string {
  const sevenHours = 7 * 60 * 60 * 1000
  return new Date(Date.parse(iso) + sevenHours).toISOString().slice(0, 19).replace('T', ' ')
}

/** The tenant's usage, or a message saying what went wrong. */
async function usageOf(key: string): Promise<Usage | string> {
  try {
    const response = await fetch(`${gatewayUrl()}/v1/usage`, {
      headers: { authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!response.ok) return `The gateway answered HTTP ${response.status}.`
    return (await response.json()) as Usage
  } catch {
    return "Couldn't reach the gateway."
  }
}
