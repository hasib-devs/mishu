# Chithi — core architecture and phase-1 design

Approved in conversation 2026-11-25: approach **1** (mount Hono beside the existing
handler) and **hour slots** in the schema.

## Intent

Chithi is a letter store inside `mishu`. Phase 1 is manual entry: a dashboard index
where letters are listed, created, edited and deleted, with a small modal form
(textarea + info label + button), styled after the supplied screenshot. Phase 2
adds hourly AI generation from a Cloudflare cron; the module will keep growing
after that. The point of doing the architecture now is that later features land
additively, without rewriting the store or the API.

Stack direction from the user: Hono for the backend, Zod for validation, Drizzle
ORM for D1, shadcn UI components/blocks on the frontend, reuse what exists,
install what is missing, no reinvented wheels.

## Goals

- D1-backed `chithis` table defined once in a Drizzle schema, applied through the
  existing `wrangler d1 migrations apply` flow.
- `/api/chithis` CRUD routes on a Hono app mounted inside the existing Worker,
  with Zod validation and consistent JSON errors/CORS.
- `/chithi` SPA page: letter index with create/edit in a shadcn `Dialog` modal and
  delete via the existing `ConfirmDialog`.
- Typed fetch client in `src/lib/chithi-api.ts`, mirroring `thread-api.ts`.
- A service layer the future cron can call without changing the schema or routes.
- Tests for CRUD and validation; `pnpm run build` and `pnpm run lint` clean of new errors.

## Non-goals

- AI generation and the actual cron trigger (design seam only in phase 1).
- Auth/login, recipients, delivery, per-user scoping (nothing in this app is authenticated today).
- Paper-style picker in the create form, "Help me write", character-limit UI beyond a counter.
- Pagination/cursor beyond a bounded `limit`; rich text; attachments.

## Anti-goals

- A second migration system running beside Wrangler's `d1_migrations` table.
- Touching the streaming chat handler or the legacy `/api/*` NVIDIA proxy.
- Adding a router dependency for one extra page.

## Constraints

- React 19 + Vite 8 SPA, Cloudflare Worker + D1, no router, Node v26.7.0, TypeScript 6.
- `tsconfig.worker.json` includes only `worker/`; every worker-side module (Drizzle
  schema, validation, service, routes) must live under `worker/`. `tsconfig.app.json`
  includes only `src/`, so client types live in `src/`.
- Existing migrations: `0001_init.sql`, `0002_message_parts.sql` (already applied locally).
- Existing tests use `node --test tests/*.test.ts` with `tests/support/fake-d1.ts`
  and call `worker.fetch()` directly; the new tests must fit that pattern.
- `pnpm run lint` already has pre-existing errors; add none. Never print or commit secret values.

## Approaches considered

1. **Mount Hono beside the current handler** *(chosen)* — `worker/index.ts` delegates
   only `/api/chithis` and `/api/chithis/*` to a new Hono app; chat streaming and
   the proxy stay byte-for-byte unchanged. Additive, low regression risk, the
   service layer is directly callable from a future cron.
2. **Rewrite all Worker routes in Hono** — one consistent app, but it touches the
   working SSE chat handler and proxy for no phase-1 gain.
3. **Separate Worker + D1** — clean isolation, but two deploys, duplicated config,
   and awkward sharing of the AI key with future cron work.

## Decided how

### Database and migrations

`worker/chithi/schema.ts` defines `chithis`:

| column | type | notes |
|---|---|---|
| `id` | `text` PK | `crypto.randomUUID()` |
| `content` | `text NOT NULL` | 1–600 characters, enforced by Zod |
| `source` | `text NOT NULL DEFAULT 'manual'` | `manual` \| `ai` |
| `generated_for` | `integer` nullable | UTC hour-start epoch ms; unique when present |
| `paper_style` | `text NOT NULL DEFAULT 'classic'` | presentation hint from screenshot; not editable in phase 1 |
| `created_at`, `updated_at` | `integer NOT NULL` | epoch ms |

Unique index on `generated_for` (SQLite treats NULLs as distinct, so manual rows
with NULL are unrestricted), so the hourly cron cannot create two letters for one
hour. Manual creates leave `generated_for` null, which
keeps the modal to a single textarea. **Call (builder check):** `generated_for`
and `source` are service-layer inputs only in phase 1 — HTTP clients cannot set
them, so an unauthenticated caller cannot occupy hours and starve the future
cron. The cron/service claims a slot via `createChithi`; a duplicate slot returns
409 at the service layer. A future UI can expose slot selection by adding an
additive API field.

`drizzle.config.ts` points at `worker/chithi/schema.ts` and generates into
`./drizzle`. Generated SQL is promoted to `migrations/0003_chithi.sql` so Wrangler
remains the single apply path; Drizzle's `meta/` stays in the repo for schema
bookkeeping only. `worker/chithi/db.ts` is a `drizzle(env.DB)` factory using the
`drizzle-orm/d1` driver.

### Backend

- `worker/chithi/validation.ts` — Zod schemas: `createChithiSchema` and
  `patchChithiSchema` accept `content` only (`patch` = 1 field), `listQuerySchema`
  accepts `limit`; `content.trim().length` between 1 and 600. Hour alignment and
  slot conflicts are service-layer rules for later cron callers.
- `worker/chithi/service.ts` — `listChithis`, `getChithi`, `createChithi`,
  `updateChithi`, `deleteChithi`; all DB access and the hour-conflict rule live
  here so the cron reuses them.
- `worker/chithi/routes.ts` — Hono app typed with `Bindings: Env`, `cors()`
  middleware matching the current `CORS_HEADERS`, and `@hono/zod-validator` for
  JSON/query validation. Routes: `GET /api/chithis?limit=`, `POST /api/chithis`,
  `GET /api/chithis/:id`, `PATCH /api/chithis/:id`, `DELETE /api/chithis/:id`.
- `worker/index.ts` — one delegation branch before the legacy `/api/*` proxy:
  if the path is `/api/chithis` or starts with `/api/chithis/`, call
  `chithiApp.fetch(request, env, ctx)` and return. No other handler changes.
- Errors: `{ error: string }`, 400 validation / 404 missing / 500 unexpected,
  through one Hono `onError` handler. 409 slot taken is a service-layer outcome
  reserved for the cron. Create returns 201 with the row, PATCH returns 200 with
  the updated row, delete returns 200 `{ success: true }` like the thread API.
- Cron seam: `worker/chithi/generate.ts` will call the AI SDK already used in
  `handleChatCompletions` and then `createChithi` with `source: "ai"` and the
  current hour. No `scheduled` export and no `triggers.crons` in phase 1.

### Frontend

- `src/lib/chithi-api.ts` — `Chithi` type and `list/create/get/update/delete`
  fetch wrappers using the same `request<T>` pattern as `thread-api.ts`.
- `src/components/chithi/chithi-dashboard.tsx` — `/chithi` index page: title,
  "New Chithi" button, responsive card grid of letters (paper-textured preview,
  excerpt, timestamp, source badge when `ai`), per-card Edit/Delete, empty/loading/error states.
- `src/components/chithi/chithi-form-dialog.tsx` — shadcn `Dialog` used for both
  create and edit: one `Textarea`, an info label ("Write a short letter…"),
  an `N/600` counter, and a Save button; submit disabled while saving or empty/over limit.
- Install shadcn `dialog` via the existing `components.json` (style `base-nova`,
  lucide icons); reuse existing `Button`, `Textarea`, `ConfirmDialog`.
- `src/App.tsx` — small pathname switch: `window.location.pathname === "/chithi"`
  renders the dashboard, otherwise the current chat shell. Add a link in
  `ThreadSidebar` to `/chithi` and a "Back to chat" link on the dashboard;
  `popstate` switches views. No router dependency, no change to thread query-param logic.
- Visuals: dark UI with purple accent and CSS-textured paper cards matching the
  composition of the user-supplied screenshot (attached to the request, not a repo
  asset — the only repo image is the unused Vite starter `src/assets/hero.png`).
  No new image or font assets in phase 1.

## Left to the builder

- Exact Tailwind classes, icons and error/empty-state copy.
- How to teach `tests/support/fake-d1.ts` to recognise Drizzle's generated SQL
  (quoted/lowercased identifiers); keep one fake rather than duplicating it.
- Slot selection in the modal later; phase 1 keeps `generatedFor` service-only.
- Cursor pagination and any `paper_style` UI when those features are requested.

## Verification

1. `tests/worker-chithi.test.ts`: create/list/get/patch/delete through
   `worker.fetch`, 400 for empty/601-char input, 404 for a missing id, CORS
   headers present; a service-level test for duplicate `generated_for`.
2. Apply `migrations/0003_chithi.sql` locally against the existing D1 database.
3. `node --test tests/*.test.ts`; `pnpm run lint` (no new errors); `pnpm run build`.
4. Browser pass: `/chithi` lists letters, create/edit/delete work, refresh
   persists, back/forward between chat and dashboard works.
