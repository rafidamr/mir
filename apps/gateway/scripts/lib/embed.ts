import type { Embedder } from '../../src/assistant/embedder.ts'

/** Embeds many texts in small batches (big batches waste memory on padding), showing progress. */
export async function embedInBatches(
  embedder: Embedder,
  texts: readonly string[],
  label: string,
  batchSize = 32,
): Promise<Float32Array[]> {
  const vectors: Float32Array[] = []
  for (let start = 0; start < texts.length; start += batchSize) {
    vectors.push(...(await embedder.embed(texts.slice(start, start + batchSize))))
    process.stdout.write(`\r  Embedding ${label}: ${vectors.length}/${texts.length}`)
  }
  process.stdout.write('\n')
  return vectors
}

/** Puts vectors back to back in one array, the layout the knowledge base file uses. */
export function flatten(vectors: readonly Float32Array[], dimensions: number): Float32Array {
  const flat = new Float32Array(vectors.length * dimensions)
  vectors.forEach((vector, i) => {
    flat.set(vector, i * dimensions)
  })
  return flat
}
