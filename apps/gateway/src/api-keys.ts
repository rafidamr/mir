import { createHash, randomBytes } from 'node:crypto'

export function generateApiKey(): string {
  return `mir_${randomBytes(24).toString('base64url')}`
}

/** Keys are stored scrambled with SHA-256, so a copy of the database can't be used to call the API. */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}
