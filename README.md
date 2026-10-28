# Mini Inference Router

A small AI gateway with a customer support assistant on top.

The gateway checks each tenant's API key, keeps the tenant within its quota, picks which model answers, streams the answer and records what it cost. The assistant answers from a slice of the Bitext customer support dataset and returns the detected intent, the entries it retrieved and a confidence signal. A Next.js console shows it all.

- **Console:** https://mir-console.vercel.app
- **Gateway:** https://mir-gateway-143244922679.asia-southeast1.run.app
- **Report:** [REPORT.md](REPORT.md) covers the design choices, routing rules, the test run and what was cut.
- **Test-run results:** [eval/results/test-run.md](eval/results/test-run.md)

## Layout

| Folder | What's in it |
|---|---|
| `apps/gateway/src` | The gateway: endpoints (`app.ts`), routing (`router/`), the assistant and its lookup (`assistant/`), and the database (`db/`) |
| `apps/gateway/test` | The automated tests |
| `apps/gateway/scripts` | Data preparation, the lookup benchmark, seeding, the live check and the test run |
| `apps/console` | The Next.js console: a chat playground and a usage page |
| `data/` | The knowledge base: 2,000 Bitext entries and their vectors (`kb/`), and the practice and test questions, and the off-topic messages (`eval/`) |
| `eval/` | The lookup benchmark and the final test-run results |

## Run it locally

You need Node.js 24 and Docker.

1. Install packages and start the database:
   ```sh
   npm install
   docker compose up -d db
   ```
2. Copy `apps/gateway/.env.example` to `apps/gateway/.env`, and fill in `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.
3. Create the tables and the demo tenants. The seed prints each tenant's API key; keys are stored only as hashes, so that's the only time you'll see them.
   ```sh
   npm run db:migrate -w @mir/gateway
   npm run db:seed -w @mir/gateway
   ```
4. Start the gateway on http://localhost:8080. The first start downloads the small lookup model.
   ```sh
   npm run dev -w @mir/gateway
   ```
5. Ask it something:
   ```sh
   curl -N http://localhost:8080/v1/assistant \
     -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
     -d '{"message": "I want to cancel my order"}'
   ```
6. To run the console, copy `apps/console/.env.example` to `apps/console/.env.local` and put the keys in `TENANT_KEYS`. Then run `npm run dev -w @mir/console` and open http://localhost:3000.

**Demo tenants:**
- `tenant1`: allows training, quota 1,000;
- `tenant2`: doesn't allow training; quota 1,000;
- `tenant3`: allows training, quota 3;
- `eval`: for the test run, allows training, quota 5,000.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Runs the 63 automated tests covering the front door (e.g. keys, input, quota), the router (switching rules, limits, cost, etc), the assistant (lookup, refusals) and the whole gateway. Needs the database from `docker compose up -d db`. |
| `npm run lint`, `npm run typecheck` | Biome and TypeScript checks |
| `npm run eval` | The final test run: both models answer the 30 test questions and 6 off-topic messages |
| `npm run grade` | Grades the test run's answers with Claude Opus 5.5, through Claude Code subscription |
| `npm run check-deployment -- <gateway URL> [console URL]` | Checks against the live system covering multiple query types, routing rule, endpoints, and console pages. Needs `apps/gateway/.env.production` and the live keys in `.cache/live-keys.txt`. |
| `npm run data:prepare`, `npm run data:benchmark` | Rebuild the data split and the knowledge base, and rerun the lookup benchmark |

## Current Deployment

- **Gateway:** Cloud Run, built from the root `Dockerfile` by `gcloud run deploy --source .`. The image includes the lookup model.
- **Database:** Neon PostgreSQL, in Singapore like the gateway.
- **Console:** Vercel, built from this repository with `apps/console` as the root directory. See `apps/console/vercel.json`.

The Bitext dataset is used under CDLA-Sharing-1.0.
