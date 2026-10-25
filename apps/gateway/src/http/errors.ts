import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** An error that is sent back as JSON: { "error": { "code": "...", "message": "..." } }. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
