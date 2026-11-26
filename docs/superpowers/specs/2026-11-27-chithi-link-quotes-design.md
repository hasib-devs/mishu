# Chithi link discovery and AI quote sending — design

## Intent

After each hourly free4talk scrape finishes, find `chithi.me/<username>` links in
room topics and participant bios, keep a persistent list of the valid ones, and
send each user a different, freshly AI-generated short quote.

## Goals

- Discover chithi.me links in `f4t_rooms.topic` and `f4t_participants.bio` from the
  newest snapshot only.
- Validate a username against `GET https://chithi.me/api/profile/<username>`;
  accept only existing, non-paused profiles.
- Persist discovered targets in their own D1 table, because raw `f4t_*` rows are
  pruned by the daily rollup.
- Send one AI-generated quote per target user, at most once per user, capped per
  run, using the existing Browser Run / Playwright binding.
- Expose the discovered list through a read API and an additive frontend page.

## Non-goals

- No auth, no admin UI for triggering sends, no direct attack on the chithi.me
  private API (it needs browser fingerprint/WURFL signals).
- No changes to the existing scrape or chithi CRUD behaviour.

## Constraints

- Time values in the new table are epoch-ms integers (chithi convention).
- Quotes are generated with the NVIDIA OpenAI-compatible endpoint already used
  by `worker/chithi/generate.ts`; a fresh generation per target user.
- Send path uses `@cloudflare/playwright`, imported lazily so `node --test`
  can load modules that reference it.
- The new API path must be mounted before the legacy `/api/*` proxy.

## Approach

Chosen: a new `worker/chithi-links/` vertical slice (extract → verify → db →
quote → sender → pipeline → routes), chained onto the existing hourly cron after
`scrapeFree4Talk` resolves. Alternative considered: direct `POST
/api/chithi/letters` from the Worker; rejected because the payload requires a
FingerprintJS visitor id and WURFL device data produced in the browser, so it
would break whenever those signals change. Browser automation reuses the same
binding the scraper already depends on.

## Open decisions resolved by the builder

- Username charset: `[A-Za-z0-9_.]`, max 30 chars; trailing `.`/`_` stripped;
  dedupe case-insensitively, preserve first-seen casing.
- Per-run send cap: 25 users. Already-sent users are skipped forever.
- Quote length: up to 600 characters (the chithi.me limit), generated with a
  randomly varied theme so different users receive different quotes.
