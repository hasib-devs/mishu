# Mishu

Mishu is a focused AI workspace that runs entirely on Cloudflare's edge. A single
Worker serves the React app and the API, backed by one D1 database. It combines
streaming chat over NVIDIA models with three data-driven modules: hourly AI
letters, Free4Talk community analytics, and automated quote delivery to profiles
discovered in community pages.

## Features

| Surface | Path | What it does |
| --- | --- | --- |
| Chat | `/` | Streamed replies from a curated NVIDIA model catalog, selectable reasoning effort, persistent threads, a server-side `runCommand` tool, and markdown/syntax-highlighted output. |
| Chithi | `/chithi` | AI-generated letters, one per UTC hour slot, with paper-style rendering. Supports browse/create/edit/delete and hourly generation. |
| Free4Talk | `/free4talk` | Hourly scrape of public Free4Talk rooms with KPIs, language trends, hourly activity, top owners/users, and a filterable live room list. Raw rows are pruned daily; compact daily rollups are kept permanently. |
| Chithi links | `/chithi-links` | Finds `chithi.me/<username>` links in room topics and bios, verifies the profiles, and sends each one a fresh AI quote through browser automation. Read API plus a token-gated manual trigger. |

The header countdown reads `GET /api/schedule` to show the next hourly and daily
run, computed from the same cron expressions the Worker uses.

## Stack

- **Frontend** — React 19, Vite 8, TypeScript 6, Tailwind 4, shadcn, React Router 8, TanStack Query, AI SDK (`ai`, `@ai-sdk/react`).
- **Backend** — Cloudflare Worker with Hono, D1 via Drizzle ORM, Wrangler cron triggers, and Browser Run (`@cloudflare/playwright`) for scraping and sending.
- **Models** — NVIDIA's OpenAI-compatible chat endpoint through the AI SDK, with a server-side tool loop.

## Quick start

Requires Node.js 22.12+ and pnpm.

```sh
pnpm install
cp .env.example .dev.vars   # replace the commented placeholders with your own values
pnpm dev
```

The dev server runs the Vite SPA with the Cloudflare Worker plugin, so API routes
work locally against a local D1 database.

Apply migrations before first run:

```sh
pnpm db:migrate:local
```

## Configuration

Local secrets live in `.dev.vars` (gitignored). For deployment, set them as
Wrangler secrets with `wrangler secret put <NAME>` rather than committing values.

| Variable | Used for |
| --- | --- |
| `VITE_NVIDIA_API_KEY` | Chat completions (`worker/chat.ts`). |
| `NVIDIA_API_KEY` | Hourly Chithi generation (`worker/chithi/generate.ts`). |
| `MANUAL_RUN_TOKEN` | Guards `POST /api/chithi-links/run` via the `X-Run-Token` header. |

Bindings come from `wrangler.jsonc`: `DB` (D1 database `mishu-threads`) and
`MYBROWSER` (Browser Run). Cron triggers are `0 * * * *` (hourly: Chithi
generation → Free4Talk scrape → link pipeline) and `10 0 * * *` (daily rollup and
prune). All time buckets are UTC.

## Scripts

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the local dev server. |
| `pnpm build` | Type-check both TS projects and build the SPA. |
| `pnpm lint` | Run ESLint. |
| `pnpm test` | Run the Node test suite. |
| `pnpm check` | Lint + test + build — the full verification gate. |
| `pnpm preview` | Build and preview locally. |
| `pnpm deploy` | Build and deploy with Wrangler. |
| `pnpm cf-typegen` | Regenerate `worker-configuration.d.ts` from Wrangler config. |
| `pnpm db:generate` | Generate a Drizzle migration. |
| `pnpm db:migrate:local` / `:remote` | Apply D1 migrations. |
| `pnpm db:migrations:local` / `:remote` | List applied migrations. |
| `pnpm db:query:local` / `:remote` | Run a D1 SQL command. |

## API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat/completions` | Streamed chat completion with server-side tools. |
| `GET/POST /api/threads` | List or create saved conversations. |
| `GET/DELETE /api/threads/:id` | Read or delete a thread. |
| `POST/PUT /api/threads/:id/messages` | Append a message or replace all messages. |
| `GET /api/schedule` | Server time and the next hourly/daily run. |
| `GET/POST /api/chithis` | List or create letters. |
| `GET/PATCH/DELETE /api/chithis/:id` | Read, edit, or delete a letter. |
| `GET /api/free4talk/latest` | Newest snapshot. |
| `GET /api/free4talk/snapshots` | Recent snapshots (`limit`, 1–100). |
| `GET /api/free4talk/languages` | Daily language stats (`days`, 1–90). |
| `GET /api/free4talk/top-owners` / `top-users` | Most active hosts/users. |
| `GET /api/free4talk/rooms` | Latest rooms, filterable by `language`, `level`, `q`. |
| `GET /api/chithi-links` | Discovered, verified profiles. |
| `POST /api/chithi-links/run` | Trigger the hourly jobs manually (requires `X-Run-Token`). |
| `/api/*` (other) | Legacy pass-through proxy to NVIDIA `/v1`. |

## Project layout

```
src/                     React app (only included by tsconfig.app.json)
  routes/                Route components mounted in App.tsx
  pages/                 Larger feature screens
  components/            Shared UI, chat, chithi, and brand components
  lib/                   Typed API clients, query hooks, model catalog, utilities
worker/                  Cloudflare Worker (only included by tsconfig.worker.json)
  index.ts               fetch + scheduled entry points
  chat.ts, threads.ts    Chat completions and thread persistence
  chithi/                Letter store: schema, db, service, validation, routes
  free4talk/             Scraper, parsing, aggregation, db, routes
  chithi-links/          Extract → verify → db → quote → sender → pipeline
  hourly.ts              Shared hourly job orchestration
  schedule*.ts           Cron constants, next-run math, schedule endpoint
migrations/              Wrangler D1 SQL migrations
drizzle/                 Generated Drizzle schema snapshots
docs/superpowers/        Dated design specs and implementation plans
tests/                   node --test suites and D1 fakes
public/                  Static assets and PWA/brand files
```

## Data and migrations

D1 tables: `threads`, `messages`, `chithis`, and the `f4t_*` family
(`snapshots`, `rooms`, `participants`, `daily_stats`, `chithi_targets`,
`chithi_quote_history`). SQL migrations live in `migrations/` and are applied
through Wrangler; Drizzle's generated snapshots live in `drizzle/`.

## Tests

```sh
pnpm test
```

Tests use `node --test tests/*.test.ts`, call handlers and `worker.fetch()`
directly, and use the D1 fakes in `tests/support/`. They do not require a browser,
an AI key, or live D1. Run `pnpm check` before declaring a change complete.

## Deployment

```sh
pnpm deploy
```

This builds the SPA and deploys the Worker with Wrangler. Set the secrets listed
above on the deployed Worker and apply remote migrations before relying on the
cron jobs.

## Brand assets

The mark is a chat bubble with an AI spark — deliberately wordmark-free so it
holds up at favicon size. SVG files in `public/` are the source of truth; PNGs
are rendered from them and should not be hand-edited.

| Source | Outputs |
| --- | --- |
| `public/logo.svg` | `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` |
| `public/logo-mono.svg` | Single-color mark for arbitrary backgrounds (`currentColor`) |
| `public/icon-maskable.svg` | `icon-512-maskable.png` — safe-zone PWA icon |
| `public/og-image.svg` | `og-image.png` — 1200×630 social preview |

Regenerate a PNG from source (renderer is fetched on demand):

```sh
npx --yes @resvg/resvg-js-cli --fit-width 512 public/logo.svg public/icon-512.png
```

Browser metadata (theme color, manifest, icons, social tags) lives in
`index.html` and `public/manifest.webmanifest`. The in-app mark is
`src/components/brand-logo.tsx`.

## Design history

Architectural decisions and implementation plans are kept as dated records under
[`docs/superpowers/specs`](docs/superpowers/specs) and
[`docs/superpowers/plans`](docs/superpowers/plans). Read the relevant record
before extending a module; add a new dated record for new work rather than
rewriting history.
