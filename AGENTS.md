# AGENTS.md

Instructions for agents working in this repo. User-facing documentation is in
`README.md`; this file is for the unwritten conventions that code alone does not
tell you.

## What this is

Mishu is a Cloudflare Worker + React 19/Vite 8 SPA on one D1 database. The Worker
is both the API and the SPA host. Four surfaces: chat (`/`), chithi (`/chithi`),
free4talk (`/free4talk`), chithi-links (`/chithi-links`).

## Commands

`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm check` (lint + test +
build), `pnpm preview`, `pnpm deploy`, `pnpm cf-typegen`.

Database: `pnpm db:generate`, `pnpm db:migrate:local` / `:remote`,
`pnpm db:migrations:local` / `:remote`, `pnpm db:query:local` / `:remote -- "<sql>"`.

`pnpm check` is the verification gate. Report real output, not an assumption
that it passed.

## Hard constraints

- **Two TS projects, no crossover.** `tsconfig.app.json` includes only `src`;
  `tsconfig.worker.json` includes only `worker`. Worker-side modules (Drizzle
  schemas, validation, services, routes) live in `worker/`; client types and
  fetch clients live in `src/`. The `@/*` alias resolves to `src/*` in both Vite
  and TS — never use it from worker code.
- **Type syntax is strict.** `verbatimModuleSyntax` requires `import type` for
  types; `erasableSyntaxOnly` rules out enums and parameter properties;
  `noUnusedLocals`/`noUnusedParameters` are on.
- **Generated types are generated.** `worker-configuration.d.ts` comes from
  `pnpm cf-typegen`; never hand-edit it. New bindings require regenerating it.
- **Route order matters.** In `worker/index.ts`, mount each Hono app
  (`/api/chithis`, `/api/free4talk`, `/api/chithi-links`) before the catch-all
  legacy `/api/*` NVIDIA proxy, or requests are proxied instead of handled.
- **No secrets in source, docs, commits, or chat.** `wrangler.jsonc` and
  `.env.example` currently contain plaintext key values; never copy those values
  anywhere. New configuration belongs in `.dev.vars` or `wrangler secret put`.

## Conventions

- Backend features are **vertical slices** under `worker/<name>/`: `schema.ts`,
  `db.ts`, `routes.ts`, `service.ts`, plus `extract` / `verify` / `quote` /
  `sender` / `pipeline` where needed. Mount a Hono app from `worker/index.ts`.
- Frontend: route component in `src/routes/`, substantial screens in
  `src/pages/`, typed fetch client in `src/lib/<name>-api.ts`, shared query hooks
  in `src/lib/query-hooks.ts`.
- Drizzle schemas live under `worker/`; `drizzle.config.ts` points at
  `worker/chithi/schema.ts` only. Adding a schema means updating that path.
- D1 time values are epoch-ms integers; all bucketing is UTC.
- The hourly chain in `worker/hourly.ts` is chithi → scrape → links; links are
  skipped when scrape fails. Steps are injectable so tests need no browser, AI
  key, or D1.
- `POST /api/chithi-links/run` requires `X-Run-Token` matching `MANUAL_RUN_TOKEN`
  and has a per-isolate in-flight guard. Keep both properties if extending it.
- Lazy-import `@cloudflare/playwright` so modules that merely reference it stay
  loadable under `node --test`.

## Tests

`pnpm test` runs `node --test tests/*.test.ts` — not Vitest or Jest. Use the D1
fakes in `tests/support/` (`fake-d1.ts`, `sqlite-d1.ts`) and call handlers or
`worker.fetch()` directly. New modules need tests in that style.

## Workflow

- Additive-first: prefer new endpoints and pages over changing existing
  behaviour.
- Read the relevant dated record in `docs/superpowers/specs/` or
  `docs/superpowers/plans/` before extending a module. Keep those as history;
  write a new dated record for new work.
- When behaviour changes, update the README section that describes it.
- Fix root causes; check sibling call paths for the same flaw. Do not commit,
  push, or rewrite history unless asked.

## Brand assets

SVGs in `public/` are the source of truth; PNGs are rendered from them and are
not hand-edited. Regenerate with
`npx --yes @resvg/resvg-js-cli --fit-width 512 public/logo.svg public/icon-512.png`.
Browser metadata lives in `index.html` and `public/manifest.webmanifest`; the
in-app mark is `src/components/brand-logo.tsx`.
