export interface Tenant {
  id: string
  key: string
  /** The start of the key, safe to show: "mir_TpRh…". */
  maskedKey: string
}

export function gatewayUrl(): string {
  const url = process.env.GATEWAY_URL
  if (!url) throw new Error('GATEWAY_URL is not set')
  return url.replace(/\/$/, '')
}

export function tenants(): Tenant[] {
  const keys = JSON.parse(process.env.TENANT_KEYS ?? '{}') as Record<string, string>
  return Object.entries(keys).map(([id, key]) => ({ id, key, maskedKey: `${key.slice(0, 8)}…` }))
}
