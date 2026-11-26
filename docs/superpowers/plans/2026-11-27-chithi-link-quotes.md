# Chithi link quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each hourly free4talk scrape, discover chithi.me links in room topics and participant bios, validate them, persist them, and send each valid user a different AI-generated quote.

**Architecture:** New `worker/chithi-links/` vertical slice chained after `scrapeFree4Talk()` in the existing hourly cron. Raw SQL against a new `f4t_chithi_targets` table; profile validation via `GET /api/profile/<username>`; quote generation via the existing NVIDIA OpenAI-compatible SDK; sending via Browser Run + Playwright against the real chithi.me form. Hono read endpoint plus an additive React page expose the list.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, Hono, Drizzle-shaped raw SQL, `@ai-sdk/openai-compatible`, `ai`, `@cloudflare/playwright`, React + TanStack Query, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-27-chithi-link-quotes-design.md`

## Global Constraints

- Time values in `f4t_chithi_targets` are epoch-ms integers.
- Quotes are AI-generated, one fresh generation per target user, max 600 chars.
- Per-run send cap is 25; a user is never sent to twice.
- `@cloudflare/playwright` and `cloudflare:` dependent code must be lazy-imported inside functions.
- New `/api/chithi-links` path must be matched before the legacy `/api/*` proxy, in both OPTIONS and normal dispatch.
- Migrations must exist in `migrations/`; `drizzle/` is untouched for this raw-SQL table.

## Review Focus

- A chithi.me URL in a bio with a trailing sentence punctuation must not include the punctuation in the username.
- A lookalike host (`notchithi.me`, `chithi.me.evil.com`) must not be accepted.
- A paused or missing profile must be persisted as inactive and never sent to.
- A user who was already sent to must not receive a second quote on later runs.
- If sending fails for one user, the remaining users in the run still get their quotes.

---

### Task 1: Extract chithi.me usernames from text

**Files:** Create `worker/chithi-links/extract.ts`, `tests/chithi-links-extract.test.ts`

**Interfaces:**
- Produces: `extractChithiUsernames(text: string | null | undefined): string[]` — unique usernames, case-insensitive dedupe, first-seen casing preserved.

- [ ] **Step 1: Write failing tests for extraction**
  Cover: full URL, scheme-less URL, `www.` host, query/fragment truncation, trailing `.`/`_`, lookalike hosts rejected, dedupe across one text, null/empty input.

- [ ] **Step 2: Run `pnpm exec node --test tests/chithi-links-extract.test.ts` — expect FAIL (module missing)**

- [ ] **Step 3: Implement `extract.ts`** with a case-insensitive regex anchored on a `chithi.me/` host boundary, stripping trailing punctuation from the captured username.

- [ ] **Step 4: Run the test file — expect PASS**

- [ ] **Step 5: Commit**

### Task 2: Verify a chithi.me profile

**Files:** Create `worker/chithi-links/verify.ts`, `tests/chithi-links-verify.test.ts`

**Interfaces:**
- Produces: `verifyChithiProfile(username: string, fetchImpl?: typeof fetch): Promise<{ id: string; username: string; paused: boolean } | null>`

- [ ] **Step 1: Write failing tests with an injected fetch** covering valid profile, paused profile → `null`, 404 → `null`, malformed JSON → `null`, and that the requested URL is `https://chithi.me/api/profile/<username>`.

- [ ] **Step 2: Run the test file — expect FAIL**

- [ ] **Step 3: Implement `verify.ts`** with a 10s `AbortSignal.timeout`, JSON parse, id/username validation and case-insensitive username match.

- [ ] **Step 4: Run the test file — expect PASS**

- [ ] **Step 5: Commit**

### Task 3: Persistent target table and data access

**Files:** Create `migrations/0005_chithi_links.sql`, `worker/chithi-links/db.ts`, `tests/chithi-links-db.test.ts`; modify `tests/support/sqlite-d1.ts`

**Interfaces:**
- Produces: `readLatestSnapshotTexts(db): Promise<{ topics: string[]; bios: string[] }>`; `upsertTargets(db, items: { username: string; source: string }[], now: number): Promise<number>` (returns newly inserted count); `listTargets(db, limit): Promise<TargetRow[]>`; `listUnsentTargets(db, limit): Promise<TargetRow[]>`; `markVerified(db, username, profileId, now, active): Promise<void>`; `markUnverified(db, username, now, error): Promise<void>`; `markSent(db, username, now, quote): Promise<void>`; `markSendFailed(db, username, now, error): Promise<void>`.

- [ ] **Step 1: Write failing tests** using `createSqliteD1` covering insert-vs-update dedupe, source preserved on first insert, newest-first listing, active/unsent filtering, and the mark functions.

- [ ] **Step 2: Add the new migration to the test shim's migration list; run tests — expect FAIL (db module missing)**

- [ ] **Step 3: Create the migration and implement `db.ts`** with parameterized SQL and `ON CONFLICT` upserts.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

### Task 4: AI quote generation

**Files:** Create `worker/chithi-links/quote.ts`, `tests/chithi-links-quote.test.ts`

**Interfaces:**
- Produces: `generateQuote(env: Record<string, unknown>, complete?: (prompt: string) => Promise<string>): Promise<string>`

- [ ] **Step 1: Write failing tests with an injected `complete`**: trims output, clamps to 600 chars, throws on empty, and includes a theme word in the prompt.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `quote.ts`**, mirroring `worker/chithi/generate.ts` for the NVIDIA client, with a random theme picked per call.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

### Task 5: Send a letter through the browser

**Files:** Create `worker/chithi-links/sender.ts`, `tests/chithi-links-sender.test.ts`

**Interfaces:**
- Produces: `sendLetters(env: Env, items: { username: string; content: string }[]): Promise<{ username: string; ok: boolean; error?: string }[]>`; lazily imports `@cloudflare/playwright`, one browser per call, one page per user, fills `textarea[aria-label="Write your anonymous letter"]`, clicks the `Send letter` button, waits for `**/letter-sent`.

- [ ] **Step 1: Write failing tests with an injected fake browser factory** covering success, per-user failure isolation, and that the browser is closed even when a send throws.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `sender.ts`** with structural page/browser types (no static Playwright import).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

### Task 6: Orchestration

**Files:** Create `worker/chithi-links/pipeline.ts`, `tests/chithi-links-pipeline.test.ts`

**Interfaces:**
- Produces: `runChithiLinkPipeline(env: Env, options?: PipelineOptions): Promise<{ discovered: number; verified: number; rejected: number; sent: number; failed: number }>`. Options inject `readTexts`, `verify`, `generate`, `send`, `now`, `maxSends`.

- [ ] **Step 1: Write failing tests** covering discovery from both sources, dedupe, verification skip for already-verified targets, rejection of paused profiles, cap enforcement, already-sent skip, and failure isolation.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `pipeline.ts`** in four phases: discover → verify → generate → send.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

### Task 7: Wire the read API and hourly cron

**Files:** Create `worker/chithi-links/routes.ts`, `tests/worker-chithi-links.test.ts`; modify `worker/index.ts`

**Interfaces:**
- Consumes: `listTargets(db, limit)`
- Produces: `chithiLinksApp` Hono app with `GET /api/chithi-links?limit=`.

- [ ] **Step 1: Write failing route tests** for a 200 list, a bounded `limit`, a 404 on unknown subpaths, and CORS preflight.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `routes.ts`** and mount it in `worker/index.ts` in both the OPTIONS block and normal dispatch, before the proxy; chain `runChithiLinkPipeline(env)` after `scrapeFree4Talk(env)` in the hourly cron with its own error log.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

### Task 8: Additive frontend page

**Files:** Create `src/lib/chithi-links-api.ts`, `src/pages/chithi-links-page.tsx`, `src/routes/chithi-links-route.tsx`; modify `src/App.tsx`, `src/components/thread-sidebar.tsx`

- [ ] **Step 1: Add the typed fetch client and query hook, mirroring `free4talk-api.ts`.**
- [ ] **Step 2: Build the `/chithi-links` page** showing username, source, verified/inactive state, send state and last quote, with a link back to chat.
- [ ] **Step 3: Register the route and sidebar link.**
- [ ] **Step 4: Run `pnpm run check` (lint + test + build) — expect PASS.**

### Task 9: Local migration verification

- [ ] **Step 1: Run `pnpm run db:migrations:local` and confirm `0005_chithi_links.sql` is pending.**
- [ ] **Step 2: Apply locally with `pnpm run db:migrate:local` only if the local D1 is a dev database; report the exact remote command for the user rather than applying remotely.**
- [ ] **Step 3: Run `pnpm run check` once more and report results.**
