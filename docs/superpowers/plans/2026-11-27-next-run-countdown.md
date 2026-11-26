# Next Run Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live, server-anchored countdown to the next hourly cron run in the headers of `/chithi`, `/free4talk`, and `/chithi-links`, each labeled with that page's job.

**Architecture:** A single `worker/schedule.ts` owns the cron expressions and computes the next UTC run from them. A new `GET /api/schedule` returns the next run times plus the Worker's clock; the SPA fetches it with TanStack Query, anchors its ticking clock to the server time, and renders a small reusable countdown component in each feature page header. Config drift between `wrangler.jsonc` and code is caught by a test.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono-style plain `Response` handlers, React 19, react-router 8, TanStack Query 5, node:test, Vite.

**Spec:** `docs/superpowers/specs/2026-11-27-next-run-countdown-design.md`

## Global Constraints

- Crons are UTC: `0 * * * *` (hourly) and `10 0 * * *` (daily rollup) as declared in `wrangler.jsonc`.
- The cron constants in `worker/schedule.ts` must exactly equal the `wrangler.jsonc` crons; a drift test enforces this.
- No imports across the `src/` ↔ `worker/` TS-project boundary; the response shape is duplicated as a type in `src/lib/schedule-api.ts`.
- The daily job is returned by the API but never rendered in the UI.
- Countdown format is `HH:MM:SS`; exact UTC time goes in the `title` tooltip.
- React Compiler: never call `Date.now()` in render or `useMemo`; seed it in a state initializer or an effect.
- No commits unless the owner explicitly asks.
- Verification gate for every task: `cd /Users/hasib/Documents/Exp/mishu && pnpm run check`.

## Review Focus

- **Exact-hour boundary:** at `2026-11-27T10:00:00Z` the next hourly run is 11:00Z, not 10:00Z — Task 1 asserts this.
- **Daily boundary:** at `2026-11-27T00:10:00Z` the next daily run is the following day at 00:10Z — Task 1 asserts this.
- **Config drift:** editing a cron in `wrangler.jsonc` without updating the code fails the drift test — Task 1 asserts this.
- **Clock skew / zero crossing:** a client 5 minutes fast still shows the right remaining time, and a passed run clamps to `00:00:00` — Task 3 asserts this.
- **Per-page labeling:** each header names its own job (chithi / scrape / quotes) and the countdown is identical — Task 4 browser probe on all three routes.

---

### Task 1: Schedule definitions and cron/config drift test

**Files:**
- Create: `worker/schedule.ts`
- Test: `tests/schedule.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CRON_HOURLY: string`, `CRON_DAILY: string`, `type ScheduleJobId = "hourly" | "daily"`, `nextRunAfter(cron: string, now: number): number` (epoch ms of the next strictly-future run).

- [ ] **Step 1: Write the failing test**

`tests/schedule.test.ts`, using `node:assert/strict` and `node:test` (the repo's convention):

```ts
test("hourly run at 10:00:00Z is the 11:00Z run", () => {
  assert.equal(nextRunAfter(CRON_HOURLY, Date.parse("2026-11-27T10:00:00Z")), Date.parse("2026-11-27T11:00:00Z"));
});
test("hourly run at 10:42:15Z is still the 11:00Z run", () => {
  assert.equal(nextRunAfter(CRON_HOURLY, Date.parse("2026-11-27T10:42:15Z")), Date.parse("2026-11-27T11:00:00Z"));
});
test("daily run at 00:10:00Z is tomorrow at 00:10Z", () => {
  assert.equal(nextRunAfter(CRON_DAILY, Date.parse("2026-11-27T00:10:00Z")), Date.parse("2026-11-28T00:10:00Z"));
});
test("daily run at 23:59Z is the same day +1 at 00:10Z", () => {
  assert.equal(nextRunAfter(CRON_DAILY, Date.parse("2026-11-27T23:59:00Z")), Date.parse("2026-11-28T00:10:00Z"));
});
test("declared crons match wrangler.jsonc", () => {
  const source = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const block = source.match(/crons\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const declared = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(declared, [CRON_HOURLY, CRON_DAILY]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/schedule.test.ts`
Expected: FAIL — module `../worker/schedule.ts` not found.

- [ ] **Step 3: Implement `worker/schedule.ts`**

Export `CRON_HOURLY = "0 * * * *"`, `CRON_DAILY = "10 0 * * *"`, and `ScheduleJobId`. Implement `nextRunAfter` by parsing the five cron fields, requiring the day/month/weekday fields to be `"*"`, building the candidate with `Date.UTC(year, month, day, hour, minute)`, and advancing one hour when the hour field is `"*"` or one day otherwise when the candidate is not strictly in the future. Throw on any cron shape outside those two forms.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/schedule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify the gate**

Run: `cd /Users/hasib/Documents/Exp/mishu && pnpm run check`
Expected: exit 0.

---

### Task 2: `GET /api/schedule` endpoint and worker wiring

**Files:**
- Create: `worker/schedule-route.ts`
- Modify: `worker/index.ts` (add the GET branch; replace the two literal cron strings in `scheduled()` with the imported constants)
- Test: `tests/worker-schedule.test.ts`

**Interfaces:**
- Consumes: `CRON_HOURLY`, `CRON_DAILY`, `nextRunAfter` from Task 1; `CORS_HEADERS` from `worker/http.ts`.
- Produces: `handleSchedule(): Response`, JSON body `{ serverNow: number, jobs: Array<{ id: "hourly" | "daily", nextRunAt: number }> }` with `Content-Type: application/json` and the shared CORS headers.

- [ ] **Step 1: Write the failing test**

`tests/worker-schedule.test.ts`:

```ts
test("GET /api/schedule returns both next runs anchored to serverNow", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/schedule"), {} as Env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = await response.json() as { serverNow: number; jobs: Array<{ id: string; nextRunAt: number }> };
  assert.deepEqual(body.jobs.map((j) => j.id), ["hourly", "daily"]);
  for (const job of body.jobs) {
    assert.ok(job.nextRunAt > body.serverNow);
    assert.equal(job.nextRunAt, nextRunAfter(job.id === "hourly" ? CRON_HOURLY : CRON_DAILY, body.serverNow));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/worker-schedule.test.ts`
Expected: FAIL with status 404 (or the generic proxy path), not 200.

- [ ] **Step 3: Implement `handleSchedule` and wire it**

Create `worker/schedule-route.ts` with `handleSchedule(): Response` as specified, calling `Date.now()` once for `serverNow`. In `worker/index.ts`, import `handleSchedule`, `CRON_HOURLY`, and `CRON_DAILY`; return `handleSchedule()` for `GET /api/schedule` **before** the generic `/api/*` proxy branch; and replace the two string literals in `scheduled()` with the imported constants. Leave the hourly and daily behavior unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/worker-schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the gate**

Run: `cd /Users/hasib/Documents/Exp/mishu && pnpm run check`
Expected: exit 0 (existing worker tests still pass).

---

### Task 3: Frontend schedule API and pure countdown helpers

**Files:**
- Create: `src/lib/schedule-api.ts`, `src/lib/schedule-format.ts`
- Test: `tests/schedule-format.test.ts`

**Interfaces:**
- Consumes: the JSON shape from Task 2 (duplicated as a local type — no cross-boundary import).
- Produces: `type ScheduleJobId = "hourly" | "daily"`, `type ScheduleResponse = { serverNow: number; jobs: Array<{ id: ScheduleJobId; nextRunAt: number }> }`, `fetchSchedule(): Promise<ScheduleResponse>` (GET `/api/schedule` via `fetch`, throwing on non-2xx, matching `src/lib/free4talk-api.ts`), `formatCountdown(ms: number): string`, and `remainingMs(nextRunAt: number, serverNow: number, receivedAt: number, now: number): number`.

- [ ] **Step 1: Write the failing test**

`tests/schedule-format.test.ts`:

```ts
test("formats hh:mm:ss with zero padding", () => {
  assert.equal(formatCountdown(3_723_000), "01:02:03");
  assert.equal(formatCountdown(42_017), "00:00:42");
});
test("clamps passed runs to zero", () => {
  assert.equal(formatCountdown(-5_000), "00:00:00");
});
test("a fast client clock still gets the server-anchored remaining time", () => {
  // serverNow=1_000, client received at 301_000 (5 min fast), next run one server-hour later
  assert.equal(remainingMs(3_601_000, 1_000, 301_000, 301_500), 3_599_500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/schedule-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the API module and helpers**

`src/lib/schedule-api.ts` exports the two types and `fetchSchedule()`. `src/lib/schedule-format.ts` exports `formatCountdown` (clamp at zero, then floor to hours/minutes/seconds with `padStart(2, "0")`) and `remainingMs` as `Math.max(0, nextRunAt - (now + (serverNow - receivedAt)))`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/hasib/Documents/Exp/mishu && node --test tests/schedule-format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the gate**

Run: `cd /Users/hasib/Documents/Exp/mishu && pnpm run check`
Expected: exit 0.

---

### Task 4: `useNextRun` hook, countdown component, and three page headers

**Files:**
- Create: `src/hooks/use-next-run.ts`, `src/components/next-run-countdown.tsx`
- Modify: `src/pages/chithi-dashboard.tsx` (header, ~line 66), `src/pages/free4talk-page.tsx` (header, ~line 62), `src/pages/chithi-links-page.tsx` (header, ~line 84)

**Interfaces:**
- Consumes: `fetchSchedule`, `ScheduleJobId`, `ScheduleResponse` from Task 3; `formatCountdown`, `remainingMs` from Task 3.
- Produces: `useNextRun(jobId: ScheduleJobId): { remainingMs: number | null; nextRunAt: number | null; isLoading: boolean; isError: boolean }`; `NextRunCountdown` props `{ jobId: ScheduleJobId; label: string }`.

- [ ] **Step 1: Implement `useNextRun`**

`useQuery({ queryKey: ["schedule"], queryFn: fetchSchedule, refetchInterval: 30_000 })`. Seed a ticking `now` with `React.useState(() => Date.now())` and advance it every 1000 ms in an effect with a cleaned-up `setInterval`. On each new query result, store `{ serverNow, receivedAt: Date.now() }` in state from an effect (never in render/`useMemo`). Return `remainingMs` via Task 3's `remainingMs(nextRunAt, serverNow, receivedAt, now)` once data and the anchor exist, plus `nextRunAt`, `isLoading`, `isError`. Do not fetch or compute any page-specific data.

- [ ] **Step 2: Implement `NextRunCountdown`**

Export only the component (react-refresh rule) from `src/components/next-run-countdown.tsx`. Render a compact header pill: `⏱ Next {label} in {formatCountdown(remainingMs)}` when data is present; `⏱ Next {label}: —` while loading and `⏱ Schedule unavailable` on error. Set `title` to the exact UTC time of `nextRunAt` when known. Pass `aria-live="off"` so the per-second tick does not spam screen readers.

- [ ] **Step 3: Wire into the three headers**

Add `<NextRunCountdown jobId="hourly" label="chithi" />` to the right-hand header group of `chithi-dashboard.tsx` (alongside the Back and New Chithi buttons), `label="scrape"` to the header of `free4talk-page.tsx`, and `label="quotes"` to the header of `chithi-links-page.tsx`. No other edits to those files.

- [ ] **Step 4: Verify the gate**

Run: `cd /Users/hasib/Documents/Exp/mishu && pnpm run check`
Expected: exit 0 (lint, all tests, and `tsc -b && vite build`).

- [ ] **Step 5: Browser probe**

Run `pnpm dev`, then visit `/chithi`, `/free4talk`, and `/chithi-links`. For each: confirm the pill shows the correct label, the seconds tick down, the `title` shows the next UTC hour, and the layout does not push existing controls off screen. Confirm no console errors and that a manual refresh of `/api/schedule` in the browser returns the expected JSON.
