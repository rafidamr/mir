import { gatewayUrl, tenants } from '../../../lib/tenants'

/** Forwards a chat message to the gateway with the chosen tenant's key, and streams the reply back. */
export async function POST(request: Request) {
  const { tenant, message } = (await request.json()) as { tenant?: string; message?: string }
  const key = tenants().find((t) => t.id === tenant)?.key
  if (!key) {
    return Response.json(
      { error: { code: 'unknown_tenant', message: 'Choose a tenant API key.' } },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetch(`${gatewayUrl()}/v1/assistant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: request.signal,
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return Response.json(
      { error: { code: 'gateway_unreachable', message: "Couldn't reach the gateway." } },
      { status: 502 },
    )
  }
}
