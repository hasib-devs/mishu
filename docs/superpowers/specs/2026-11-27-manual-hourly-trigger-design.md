# Manual hourly trigger — short design

**Intent:** Sometimes we don't want to wait for the `0 * * * *` cron. A button on
the Chithi links page should run the same work the cron does.

**Choice:** Option 2 — the button runs the **entire hourly job**: chithi letter
generation, free4talk scrape, then the chithi-links quote pipeline.

**Approach:**

- Extract the cron body from `worker/index.ts` into `worker/hourly.ts`
  (`runHourlyJobs(env)`) with injectable steps for tests. It returns a summary
  with per-step ok/error so one failure doesn't hide the others. `scheduled()`
  calls the same function.
- Add `POST /api/chithi-links/run` to the Hono sub-app. It requires
  `X-Run-Token` matching a Worker secret `MANUAL_RUN_TOKEN` (never in the client
  bundle), returns the job summary, and rejects concurrent runs with 409.
- Chithi links page: a password field (token remembered in `sessionStorage`)
  and a "Run now" button; while running it is disabled, and on completion it
  shows the summary and refreshes the table.

**Trade-offs:** the shared secret is typed once per browser session; the
in-memory in-flight flag is per Worker isolate, so two different isolates could
still run concurrently. That's acceptable here — the pipeline filters stale
links and never reuses a quote. No cooldown beyond the in-flight guard.

**Non-goals:** no user accounts, no scheduler changes, no new D1 migration.
