# Next scheduled run countdown — design

Date: 2026-11-27
Status: approved by owner

## Intent / why

The three feature pages (`/chithi`, `/free4talk`, `/chithi-links`) are refreshed by
Cloudflare cron jobs, but nothing in the UI says when the next run is. A live
countdown in each page header makes the refresh cycle visible and answers
"why is my data still stale?" without opening logs.

## Goals

- Show a one-second countdown to the next hourly run on all three feature pages.
- Label each countdown with that page's job (chithi / scrape / quotes), even
  though all three share the same hourly trigger.
- Source the schedule from the Worker, not from a copy in the browser, and
  tolerate a skewed client clock.

## Non-goals

- No countdown on the chat page.
- No display of the `10 0 * * *` daily rollup — maintenance, not a user-facing refresh.
- No manual "run now" button, no notification when the timer reaches zero.

## Anti-goals

- Do not duplicate cron expressions in frontend code.
- Do not infer the next run from the newest row's `created_at`; a skipped or
  failed job would make the countdown wrong.

## Constraints

- Client-only React + Vite SPA on Cloudflare (`not_found_handling: single-page-application`);
  declarative `react-router`, TanStack Query already installed.
- Crons live in `wrangler.jsonc`: `0 * * * *` (chithi generation, free4talk scrape,
  chithi-links quote pipeline) and `10 0 * * *` (free4talk rollup/prune), both UTC.
  `worker/index.ts` branches on those exact strings.
- A Worker cannot read its own `wrangler.jsonc` at runtime.
- `src/` and `worker/` are separate TS projects; code must not import across that boundary.
- React Compiler: no `Date.now()` directly in render or `useMemo`.

## Approaches

1. **Client-side UTC math** — compute the next top-of-hour in the browser. Cheapest,
   but the cron definition is effectively duplicated and a schedule change silently
   makes the UI lie. Rejected.
2. **Derive from data timestamps** — last `chithi.created_at` plus one hour. Survives
   a schedule change but breaks on skipped/failed runs. Rejected.
3. **Worker endpoint + shared cron definitions (chosen)** — a `worker/schedule.ts`
   defines the jobs once, a new `GET /api/schedule` returns the next run times and
   the Worker's own clock, and the browser counts down against that anchor. A test
   parses `wrangler.jsonc` so drift between config and code fails the build.

## Decisions

- API: `GET /api/schedule` → `{ serverNow: number (epoch ms), jobs: [{ id: "hourly" | "daily", nextRunAt: number }] }`.
  `daily` is returned for future use but is not rendered.
- Page mapping (all use job `hourly`): `/chithi` → "Next chithi", `/free4talk` →
  "Next scrape", `/chithi-links` → "Next quotes".
- Display: `HH:MM:SS` in the page header; exact UTC time in a `title` tooltip.
- A new hook fetches via React Query and ticks once per second, using
  `serverNow - Date.now()` as the clock offset.
- All new files (schedule module, endpoint route, hook, component); the only edits
  to existing files are inserting the component into three page headers.

## Left to builder

- Write the implementation plan via `superpowers:writing-plans`, then execute it.
- Verify with `pnpm run check` and a browser pass of the three routes.
- Do not commit unless the owner asks.
