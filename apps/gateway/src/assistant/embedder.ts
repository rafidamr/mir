import { env, pipeline } from '@huggingface/transformers'

export interface EmbeddingModelSpec {
  /** Hugging Face model id. */
  id: string
  /** How the model's per-word vectors become one sentence vector. Each model is trained for one way. */
  pooling: 'cls' | 'mean'
  /** q8 stores weights as 8-bit numbers: about 4x smaller and faster, with little quality loss. */
  dtype: 'q8' | 'fp32'
}

export const EMBEDDING_MODELS = {
  'bge-small': { id: 'Xenova/bge-small-en-v1.5', pooling: 'cls', dtype: 'q8' },
  minilm: { id: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', dtype: 'q8' },
} as const satisfies Record<string, EmbeddingModelSpec>

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS

export interface Embedder {
  readonly spec: EmbeddingModelSpec
  readonly dimensions: number
  /** One unit-length vector per text, so a dot product between two of them is their similarity. */
  embed(texts: readonly string[]): Promise<Float32Array[]>
}

export interface EmbedderOptions {
  /** Where model files are kept. */
  cacheDir?: string
  /** Whether the model may be downloaded. The deployed gateway ships it in its image instead. */
  allowDownload?: boolean
}

/** Turns text into vectors with a small model that runs on the CPU, inside this process. */
export async function createEmbedder(
  spec: EmbeddingModelSpec,
  options: EmbedderOptions = {},
): Promise<Embedder> {
  if (options.cacheDir) env.cacheDir = options.cacheDir
  env.allowRemoteModels = options.allowDownload ?? true
  const extractor = await pipeline('feature-extraction', spec.id, { dtype: spec.dtype })

  async function embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const output = await extractor([...texts], { pooling: spec.pooling, normalize: true })
    const [count, dimensions] = output.dims
    if (output.type !== 'float32' || count !== texts.length || !dimensions) {
      throw new Error(`Unexpected embedding output: ${output.type} [${output.dims.join(', ')}]`)
    }
    const data = output.data as Float32Array
    return Array.from({ length: count }, (_, i) => data.slice(i * dimensions, (i + 1) * dimensions))
  }

  const [probe] = await embed(['warm-up'])
  if (!probe) throw new Error('The embedding model returned nothing')
  return { spec, dimensions: probe.length, embed }
}
