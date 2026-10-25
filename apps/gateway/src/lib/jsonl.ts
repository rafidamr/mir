/** JSON Lines: one JSON value per line. */
export function parseJsonl<T>(text: string): T[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line) as T
      } catch {
        throw new Error(`Line ${index + 1} is not valid JSON`)
      }
    })
}

export function toJsonl(items: readonly unknown[]): string {
  return `${items.map((item) => JSON.stringify(item)).join('\n')}\n`
}
