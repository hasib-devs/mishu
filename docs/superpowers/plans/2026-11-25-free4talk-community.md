# Free4Talk Community Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an hourly-scraped free4talk.com community dashboard to mishu, with today's raw snapshots plus permanent daily rollups, participant-level detail, and a `/free4talk` frontend.

**Architecture:** Cloudflare Worker cron (hourly) uses Browser Run + `@cloudflare/playwright` to navigate free4talk, intercept the signed `sync/get/free4talk/groups` responses, aggregate them, and insert a snapshot into D1. A second daily cron rolls yesterday's raw rows into `f4t_daily_stats` then deletes them. Hono sub-app exposes read endpoints; React page renders KPIs, charts (simple CSS/SVG, no new deps), and filterable room list.

**Tech Stack:** Cloudflare Workers, D1, `@cloudflare/playwright`, Hono, React 19, TanStack Query, Tailwind 4, node:test.

**Spec:** `docs/superpowers/specs/2026-11-25-free4talk-community-design.md`

## Global Constraints

- `nodejs_compat` flag already implied by `@cloudflare/playwright`; keep `compatibility_date` ≥ 2025-09-15 (currently 2026-11-23, fine).
- Browser binding name: `MYBROWSER`; env type regenerated via `pnpm cf-typegen`.
- Migrations are plain SQL in `migrations/NNNN_*.sql` applied with `pnpm db:migrate:local`.
- Tests run with `pnpm test` (`node --test tests/*.test.ts`); new test files must match `tests/*.test.ts`.
- All timestamps UTC ISO strings (`new Date().toISOString()`).
- No new npm dependencies.

## Review Focus

- Cron dispatch must not break the existing hourly chithi generation.
- Browser must always close (try/finally) even on scrape failure, else browser hours leak.
- Snapshot insert must be atomic (batch); partial insert corrupts trends.
- Retention cron must roll up *before* delete; reverse order loses data.
- Participant rows must not duplicate within a snapshot (PK on snapshot_id, room_id, user_id).
- Frontend must handle empty state (no snapshots yet) without crashing.

---

### Task 1: Wrangler config — browser binding + daily cron

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Add browser binding and second cron**

Edit `wrangler.jsonc`: change `"crons": ["0 * * * *"]` to `"crons": ["0 * * * *", "10 0 * * *"]`, and add a `browser` binding inside the config:

```jsonc
"browser": { "binding": "MYBROWSER" }
```

- [ ] **Step 2: Regenerate env types**

Run: `pnpm cf-typegen`
Expected: `worker-configuration.d.ts` now contains `MYBROWSER: Fetcher` (Browser binding) in `__BaseEnv_Env`.

- [ ] **Step 3: Commit**

```bash
git add wrangler.jsonc worker-configuration.d.ts
git commit -m "chore: add Browser Run binding and daily rollup cron"
```

---

### Task 2: Database migration

**Files:**
- Create: `migrations/0004_free4talk.sql`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0004_free4talk.sql` with the tables from the spec (f4t_snapshots, f4t_rooms, f4t_participants, f4t_daily_stats) and indexes. Use `avg_rooms` instead of `total_rooms` for the daily rollup column (average rooms across that day's snapshots).

- [ ] **Step 2: Apply locally**

Run: `pnpm db:migrate:local`
Expected: migration applies with no errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/0004_free4talk.sql
git commit -m "feat(free4talk): add D1 schema for snapshots and daily stats"
```

---

### Task 3: Types + pure aggregation (TDD)

**Files:**
- Create: `worker/free4talk/types.ts`
- Create: `worker/free4talk/aggregate.ts`
- Create: `tests/free4talk-aggregate.test.ts`

**Interfaces:**
- Produces: `RawRoom`, `RawClient`, `AggregatedSnapshot`, `AggregatedRoom`, `AggregatedParticipant`; `aggregateSnapshot(rooms: RawRoom[], scrapedAt: string): AggregatedSnapshot`.

- [ ] **Step 1: Write failing tests**

Create `tests/free4talk-aggregate.test.ts` importing `aggregateSnapshot` from `../worker/free4talk/aggregate.ts`. Test:
1. Empty rooms → totalRooms 0, totalParticipants 0, empty arrays.
2. One room with 2 clients → totalRooms 1, totalParticipants 2, room.currentPeople 2, isLocked/noMic derived from settings, participant rows include followers/friends/supporter.
3. secondLanguage empty string becomes null.
4. Topic defaults to "" when missing.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test -- tests/free4talk-aggregate.test.ts` (or `node --test tests/free4talk-aggregate.test.ts`)
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types and aggregator**

Create `worker/free4talk/types.ts` with `RawRoom`, `RawClient`, `AggregatedRoom`, `AggregatedParticipant`, `AggregatedSnapshot`.
Create `worker/free4talk/aggregate.ts` exporting `aggregateSnapshot` implementing the mapping from the spec (rooms, participants, totals, null handling).

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/free4talk-aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/free4talk/types.ts worker/free4talk/aggregate.ts tests/free4talk-aggregate.test.ts
git commit -m "feat(free4talk): add room aggregation logic"
```

---

### Task 4: DB access layer

**Files:**
- Create: `worker/free4talk/db.ts`

**Interfaces:**
- Consumes: `AggregatedSnapshot` from `./aggregate.ts`.
- Produces: `insertSnapshot(db, agg)`, `getLatest(db)`, `listSnapshots(db, limit)`, `listRoomsLatest(db, filters)`, `topOwnersLatest(db, limit)`, `topUsersLatest(db, limit)`, `rollupAndPrune(db, day)`, `dailyStats(db, days)`.

- [ ] **Step 1: Implement DB functions**

Create `worker/free4talk/db.ts` using `D1Database` directly (raw SQL, like threads). Implement:
- `insertSnapshot`: insert into f4t_snapshots, get `meta.last_row_id`, batch-insert rooms and participants.
- `getLatest`: latest snapshot row + its rooms.
- `listSnapshots`: recent snapshot summaries ordered desc.
- `listRoomsLatest`: rooms from latest snapshot with optional `language`, `level`, `q` (topic/owner name LIKE).
- `topOwnersLatest`: group latest snapshot's rooms by owner_id, count rooms + sum current_people, order desc, limit.
- `topUsersLatest`: from latest snapshot's participants, group by user_id, take max followers/friends, count rooms, order by followers desc, limit.
- `dailyStats`: rows from f4t_daily_stats for last N days.
- `rollupAndPrune`: compute per-language aggregates for a given UTC day from raw snapshots, upsert into f4t_daily_stats, then delete snapshots for that day (cascade).

Rollup details: for each language, `avg_rooms` = average rooms across snapshots that day (rounded), `peak_rooms` = max, `peak_participants` = max, `peak_hour` = UTC hour of the snapshot with peak participants, `unique_owners` = distinct owner count across the day.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add worker/free4talk/db.ts
git commit -m "feat(free4talk): add D1 data access layer"
```

---

### Task 5: Scrape module

**Files:**
- Create: `worker/free4talk/scrape.ts`

**Interfaces:**
- Consumes: `Env`, `aggregateSnapshot`, `insertSnapshot`.
- Produces: `scrapeFree4Talk(env): Promise<{ snapshotId; totalRooms; totalParticipants }>`.

- [ ] **Step 1: Implement scrape**

Create `worker/free4talk/scrape.ts`:
1. `const browser = await launch(env.MYBROWSER, { keep_alive: 120000 });`
2. In try/finally, create page, attach response listener collecting `sync/get/free4talk/groups` JSON into a Map.
3. Navigate with `waitUntil: "networkidle"`, timeout 60s; wait 8s; scroll 3×; wait 5s.
4. Close browser in finally.
5. Convert collected Map values to array; call `aggregateSnapshot`; `insertSnapshot(env.DB, agg)`; return counts.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add worker/free4talk/scrape.ts
git commit -m "feat(free4talk): scrape rooms via Browser Run + Playwright"
```

---

### Task 6: Hono REST routes

**Files:**
- Create: `worker/free4talk/routes.ts`
- Modify: `worker/index.ts` (delegate `/api/free4talk`)

**Interfaces:**
- Routes: `GET /api/free4talk/latest`, `/snapshots`, `/languages`, `/top-owners`, `/top-users`, `/rooms`.

- [ ] **Step 1: Implement Hono app**

Create `worker/free4talk/routes.ts` exporting `free4talkApp: Hono<{ Bindings: Env }>`, following the chithi routes pattern (cors, notFound, onError). Each handler calls the corresponding db function and returns JSON. `/rooms` reads query params `language`, `level`, `q`.

- [ ] **Step 2: Wire into index.ts**

In `worker/index.ts`: import `free4talkApp`; in fetch handler, before the generic `/api/*` proxy, add:
```ts
if (url.pathname === "/api/free4talk" || url.pathname.startsWith("/api/free4talk/")) {
  return free4talkApp.fetch(request, env, ctx);
}
```
Also handle OPTIONS for these paths via the app (Hono cors handles it; but the existing OPTIONS branch delegates chithis only — add free4talk to that condition too).

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add worker/free4talk/routes.ts worker/index.ts
git commit -m "feat(free4talk): add read API endpoints"
```

---

### Task 7: Cron dispatch

**Files:**
- Modify: `worker/index.ts` (scheduled handler)

- [ ] **Step 1: Update scheduled handler**

Modify `scheduled()` to branch on `controller.cron`:
- `"0 * * * *"`: run existing `generateHourlyChithi` AND `scrapeFree4Talk(env)` (via ctx.waitUntil, each with .catch logging).
- `"10 0 * * *"`: run `rollupAndPrune(env, yesterdayUtcDate)`.

Import the new functions.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add worker/index.ts
git commit -m "feat(free4talk): wire hourly scrape and daily rollup into cron"
```

---

### Task 8: Frontend API client

**Files:**
- Create: `src/lib/free4talk-api.ts`

**Interfaces:**
- Types: `F4tSnapshot`, `F4tRoom`, `F4tDailyStat`, `F4tOwner`, `F4tUser`.
- Functions: `fetchLatest`, `fetchSnapshots`, `fetchLanguages`, `fetchTopOwners`, `fetchTopUsers`, `fetchRooms`.

- [ ] **Step 1: Implement client**

Create `src/lib/free4talk-api.ts` mirroring `chithi-api.ts` (request helper, typed fetchers hitting `/api/free4talk/*`).

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/free4talk-api.ts
git commit -m "feat(free4talk): add frontend API client"
```

---

### Task 9: Frontend page

**Files:**
- Create: `src/pages/free4talk-page.tsx`
- Create: `src/routes/free4talk-route.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create route wrapper**

Create `src/routes/free4talk-route.tsx` mirroring `chithi-route.tsx` (ErrorBoundary around page).

- [ ] **Step 2: Create page component**

Create `src/pages/free4talk-page.tsx` (or `src/components/free4talk/...`) rendering:
- Header with title + "Back to chat" link.
- Empty state when no latest snapshot.
- KPI cards (total rooms, participants, languages, owners).
- Hourly activity: simple SVG polyline/bar chart from snapshots.
- Language distribution: horizontal bars from latest rooms grouped by language.
- Top owners table.
- Top users table.
- Room list with language/level/search filters.

Use TanStack Query hooks inline (`useQuery`).

- [ ] **Step 3: Register route**

Modify `src/App.tsx` to add `<Route path="/free4talk" element={<Free4TalkRoute />} />`.

- [ ] **Step 4: Type-check + lint**

Run: `pnpm lint && npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/free4talk-page.tsx src/routes/free4talk-route.tsx src/App.tsx
git commit -m "feat(free4talk): add community dashboard page"
```

---

### Task 10: Verification

- [ ] **Step 1: Run full check**

Run: `pnpm check`
Expected: lint, tests, build all pass.

- [ ] **Step 2: Local smoke test**

Run: `pnpm dev` (or `npx wrangler dev`), trigger scrape manually via `curl` to a debug endpoint or invoke scheduled handler; verify `/free4talk` renders data. (Manual.)

- [ ] **Step 3: Final commit (if any fixes)**

```bash
git add -A
git commit -m "chore(free4talk): verification fixes"  # only if needed
```

---

## Notes for executor

- Do not install new dependencies.
- Keep all SQL parameterized.
- If `env.MYBROWSER` is unavailable in tests, do not call scrape in unit tests.
- Browser close must be in `finally`.
