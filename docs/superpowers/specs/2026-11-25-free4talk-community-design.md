# Free4Talk Community Intelligence Module — Design

**Date:** 2026-11-25
**Status:** Draft for approval
**Owner:** mishu project

## 1. Intent & Why

Mishu is a Cloudflare Workers + React app with a D1 database. This module adds a
new "Community Intelligence" feature: every hour we scrape the public room list
of **free4talk.com** (a language-learning speaking community) and store
structured snapshots, then visualize trends (which languages are growing, peak
hours, most active owners/users) in the frontend.

Why: give users/analysts a live, historical view of the language-practice
community — useful for deciding when to join, which languages are active, and who
the prolific hosts are. Raw data is retained only for the current UTC day to
control storage cost; compact daily rollups are kept permanently for long-term
trends.

## 2. Goals

- Hourly automated scrape of all public rooms (≈600) with full room + owner +
  participant detail.
- Store today's hourly snapshots in D1; delete yesterday's raw rows daily.
- Keep permanent daily rollups for long-term language/owner trends.
- Frontend dashboard at `/free4talk` showing KPIs, language trends, hourly
  activity, top owners/users, and a filterable live room list.
- Reuse existing stack: Cloudflare Workers, D1, Drizzle migrations, React Router,
  TanStack Query, Tailwind/shadcn.

## 3. Non-goals (v1)

- No authentication against free4talk; scrape anonymous public data only.
- No chat/message scraping (rooms are audio; joining not required for list).
- No alerts/notifications (v2).
- No per-user timezone; UTC buckets throughout.
- No editing/admin UI for the data.

## 4. Constraints

- Cloudflare Workers runtime; browser automation via Browser Run binding +
  `@cloudflare/playwright` (requires `nodejs_compat`, compatibility_date ≥
  2025-09-15).
- Free4Talk is bot-identified; site does not block list scraping in practice
  (verified via recon). No captcha on the public room list.
- D1 (SQLite) storage; keep raw data ≤ 1 UTC day (~14k room rows + ~24k
  participant rows/day) to stay cheap.
- Hourly cron minimum granularity 1 hour (Cloudflare Cron Triggers).
- Browser Run limits: default 60s inactivity timeout; extend via `keep_alive`
  if a scrape exceeds it. Recon scrape completed in ~10s, so default is fine
  but `keep_alive` will be set to 120000ms defensively.

## 5. Approaches considered

### Data capture
- **A (chosen): Playwright via Browser Run, intercepting network responses.**
  Navigate to free4talk, listen for `sync/get/free4talk/groups` responses,
  aggregate JSON, close browser. Structured, robust, browser handles signed
  requests.
- B: DOM scraping — fragile, misses participant stats. Rejected.
- C: Replicate signed sync API in pure fetch — high maintenance, brittle.
  Rejected.

### Storage/retention
- **A (chosen): Raw hourly snapshots for today + permanent daily rollup.**
  Daily cron rolls up yesterday → `f4t_daily_stats`, then deletes raw rows.
- B: Keep all raw history forever — too much storage growth. Rejected.
- C: Aggregates only — loses room/owner drill-down. Rejected.

## 6. Data model (D1)

New migration `migrations/000X_free4talk.sql`:

```sql
CREATE TABLE f4t_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scraped_at TEXT NOT NULL,            -- ISO UTC timestamp of the run
  total_rooms INTEGER NOT NULL,
  total_participants INTEGER NOT NULL,
  UNIQUE(scraped_at)
);

CREATE TABLE f4t_rooms (
  snapshot_id INTEGER NOT NULL REFERENCES f4t_snapshots(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  topic TEXT,
  language TEXT NOT NULL,
  second_language TEXT,
  level TEXT,
  max_people INTEGER,
  current_people INTEGER NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  no_mic INTEGER NOT NULL DEFAULT 0,
  room_url TEXT,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_verified INTEGER NOT NULL DEFAULT 0,
  owner_avatar TEXT,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (snapshot_id, room_id)
);

CREATE TABLE f4t_participants (
  snapshot_id INTEGER NOT NULL REFERENCES f4t_snapshots(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  followers INTEGER,
  following INTEGER,
  friends INTEGER,
  supporter INTEGER,
  bio TEXT,
  PRIMARY KEY (snapshot_id, room_id, user_id)
);

CREATE TABLE f4t_daily_stats (
  day TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  language TEXT NOT NULL,
  total_rooms INTEGER NOT NULL,        -- sum of room-counts across snapshots / distinct?
  peak_rooms INTEGER NOT NULL,         -- max rooms in any single snapshot that day
  peak_participants INTEGER NOT NULL,
  peak_hour INTEGER,                  -- UTC hour of peak participants
  unique_owners INTEGER NOT NULL,
  PRIMARY KEY (day, language)
);

CREATE INDEX idx_f4t_rooms_lang ON f4t_rooms(snapshot_id, language);
CREATE INDEX idx_f4t_rooms_owner ON f4t_rooms(owner_id);
CREATE INDEX idx_f4t_snapshots_scraped ON f4t_snapshots(scraped_at);
```

Note on rollup semantics: `total_rooms` in daily stats = average rooms across
that day's snapshots (or sum of distinct room-ids seen that day — TBD in
implementation; default to peak + average stored as separate columns if needed).

## 7. Backend (Worker)

### Cron triggers (wrangler.jsonc)

```jsonc
"triggers": {
  "crons": ["0 * * * *", "10 0 * * *"]
}
```

- `0 * * * *` → `scheduled()` runs `scrapeFree4Talk(env)`.
- `10 0 * * *` → `rollupAndPrune(env)`.

### Scrape flow (`worker/free4talk/scrape.ts`)

1. `const browser = await launch(env.MYBROWSER, { keep_alive: 120000 });`
2. `const page = await browser.newPage();`
3. Attach `page.on('response', ...)` collecting `sync/get/free4talk/groups` JSON
   into a `Map<roomId, room>`.
4. `await page.goto('https://www.free4talk.com', { waitUntil: 'networkidle', timeout: 60000 });`
5. `await page.waitForTimeout(8000);` then scroll a few times to ensure all
   batches arrive; wait 5s.
6. Close browser.
7. Aggregate: total_rooms, total_participants (sum of clients.length), build rows.
8. Insert snapshot + rooms + participants in a D1 batch (transaction).
9. Log counts.

### Rollup + prune flow

1. For yesterday's UTC date, compute per-language aggregates from
   `f4t_rooms` joined to `f4t_snapshots` where date(scraped_at)=yesterday.
2. Upsert into `f4t_daily_stats`.
3. Delete `f4t_snapshots` rows for yesterday (cascades to rooms/participants).

### REST endpoints (Hono or hand-rolled, under `/api/free4talk/*`)

- `GET /api/free4talk/latest` — latest snapshot metadata + room list.
- `GET /api/free4talk/snapshots?limit=24` — recent snapshot summaries (time, total_rooms, total_participants).
- `GET /api/free4talk/languages?days=7` — per-language time series (from daily rollup + today's snapshots).
- `GET /api/free4talk/top-owners?limit=20` — owners ranked by room count / participants (today).
- `GET /api/free4talk/top-users?limit=20` — participants ranked by followers/friends.
- `GET /api/free4talk/rooms?language=&level=&q=` — filterable room list from latest snapshot.

## 8. Frontend

New route `/free4talk` registered in `src/lib/app-route.ts` and sidebar.

Pages/components:
- `src/pages/Free4TalkPage.tsx` (or under `src/components/free4talk/`):
  - KPI cards: total rooms, total participants, unique languages, unique owners.
  - Line chart: rooms & participants per hour (today).
  - Bar/pie: language distribution (latest).
  - Table: top owners (rooms hosted, participants).
  - Table: top participants (followers/friends).
  - Room list with filters (language, level, search) + room detail drawer
    (topic, owner, participants, link to free4talk room).

Data fetching via TanStack Query hooks in `src/lib/free4talk-api.ts`.

## 9. Files to touch (estimate)

- `wrangler.jsonc` — add browser binding (if not present) + cron triggers.
- `migrations/000X_free4talk.sql` — new tables.
- `worker/free4talk/{scrape,rollup,db,types}.ts` — new module.
- `worker/index.ts` — wire cron `scheduled()` handler + REST routes.
- `src/lib/free4talk-api.ts`, `src/lib/free4talk-schema.ts` — client API.
- `src/lib/app-route.ts` — add route helper.
- `src/pages/Free4TalkPage.tsx` + components.
- `src/App.tsx` / router — register route + nav.
- `tests/` — unit tests for aggregation + API (fake D1).

## 10. Open questions left to builder

- Exact rollup aggregation formula (average vs distinct room count) — builder
  may choose; default to storing both `avg_rooms` and `peak_rooms`.
- Charting library: reuse existing? Check if recharts/chart.js already installed;
  if none, use a lightweight option (e.g., recharts) — builder's call, keep
  bundle small.
- Whether to fetch participant avatars (store URL only, no binary).

## 11. Success criteria

- Hourly cron runs without manual intervention; a row appears in
  `f4t_snapshots` each hour.
- Dashboard renders latest data within 5s of load.
- Yesterday's raw rows are gone after the daily rollup cron; `f4t_daily_stats`
  contains yesterday's per-language rows.
- Tests pass (`pnpm test`).
