import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseJsonl } from '../lib/jsonl.ts'

export interface KbEntry {
  id: string
  intent: string
  category: string
  /** The customer's question. This is the text that gets matched. */
  instruction: string
  /** The sample agent reply, given to the AI model as reference material. */
  response: string
}

export interface Match {
  entry: KbEntry
  /** How close the entry's question is to the query, from -1 to 1 (cosine similarity). */
  similarity: number
}

export interface KnowledgeBase {
  readonly entries: readonly KbEntry[]
  readonly dimensions: number
  /** The k entries whose questions are closest to the query vector, closest first. */
  search(query: Float32Array, k: number): Match[]
}

export interface KbManifest {
  version: string
  count: number
  embedding: {
    model: string
    pooling: 'cls' | 'mean'
    dtype: 'q8' | 'fp32'
    dimensions: number
  }
}

/**
 * Exact search: compares the query with every entry. At 2,000 entries this takes well under a
 * millisecond, so an approximate index or a vector database would add nothing.
 *
 * `vectors` holds one unit-length vector per entry, back to back, so a dot product is the
 * cosine similarity.
 */
export function createKnowledgeBase(
  entries: readonly KbEntry[],
  vectors: Float32Array,
  dimensions: number,
): KnowledgeBase {
  if (vectors.length !== entries.length * dimensions) {
    throw new Error(
      `Expected ${entries.length * dimensions} numbers for ${entries.length} entries, got ${vectors.length}`,
    )
  }

  return {
    entries,
    dimensions,
    search(query, k) {
      if (query.length !== dimensions) {
        throw new Error(`Query has ${query.length} numbers, the knowledge base uses ${dimensions}`)
      }
      const matches = entries.map((entry, index) => {
        const offset = index * dimensions
        let similarity = 0
        for (let d = 0; d < dimensions; d++) {
          similarity += (query[d] ?? 0) * (vectors[offset + d] ?? 0)
        }
        return { entry, similarity }
      })
      return matches.sort((a, b) => b.similarity - a.similarity).slice(0, k)
    },
  }
}

/** Loads the files written by `scripts/prepare-data.ts`. */
export async function loadKnowledgeBase(
  dir: string,
): Promise<{ kb: KnowledgeBase; manifest: KbManifest }> {
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as KbManifest
  const entries = parseJsonl<KbEntry>(await readFile(path.join(dir, 'kb.jsonl'), 'utf8'))
  const bytes = await readFile(path.join(dir, 'embeddings.f32'))
  // Copy into a fresh buffer: Float32Array needs 4-byte alignment, which a pooled Buffer may lack.
  const vectors = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
  if (entries.length !== manifest.count) {
    throw new Error(`Manifest lists ${manifest.count} entries but kb.jsonl has ${entries.length}`)
  }
  return { kb: createKnowledgeBase(entries, vectors, manifest.embedding.dimensions), manifest }
}
