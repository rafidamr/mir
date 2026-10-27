# The gateway, packaged for Cloud Run.
FROM node:24-slim
WORKDIR /app

# Only the gateway's runtime packages.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/
RUN npm ci --omit=dev --ignore-scripts --workspace @mir/gateway

COPY apps/gateway/src apps/gateway/src
COPY data/kb data/kb

# Download the small lookup model now, so starting up never depends on Hugging Face.
RUN node -e "import('./apps/gateway/src/assistant/embedder.ts').then(({ createEmbedder, EMBEDDING_MODELS }) => createEmbedder(EMBEDDING_MODELS['bge-small'], { cacheDir: '/app/.cache/models' }))"

CMD ["node", "apps/gateway/src/server.ts"]
