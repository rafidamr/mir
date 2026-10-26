/**
 * Starts the gateway: loads the settings, the database, the knowledge base
 * and the small lookup model, builds the router from .env, and serves the API.
 *
 *   npm run dev    (restarts when the code changes)
 *   npm start
 */
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createAssistant } from './assistant/assistant.ts'
import { createEmbedder } from './assistant/embedder.ts'
import { loadKnowledgeBase } from './assistant/knowledge-base.ts'
import { loadConfig } from './config.ts'
import { createDatabase } from './db/client.ts'
import { createLLMClients } from './router/llm-clients.ts'
import { createRouter } from './router/router.ts'

const repoRoot = path.resolve(import.meta.dirname, '../../..')

const config = loadConfig()
const { db } = createDatabase(config.DATABASE_URL)
const { kb, manifest } = await loadKnowledgeBase(path.join(repoRoot, 'data', 'kb'))
const { model, pooling, dtype } = manifest.embedding
const embedder = await createEmbedder(
  { id: model, pooling, dtype },
  { cacheDir: path.join(repoRoot, '.cache', 'models') },
)
const router = createRouter({ llmClients: createLLMClients(config) })
const app = createApp({ db, assistant: createAssistant({ kb, embedder, router }) })

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Gateway ready on http://localhost:${info.port} (knowledge base ${manifest.version})`)
})
