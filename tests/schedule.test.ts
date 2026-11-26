import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CRON_DAILY, CRON_HOURLY, nextRunAfter } from "../worker/schedule.ts";

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
  const cronsLine = source.split("\n").find((line: string) => line.includes('"crons"')) ?? "";
  const declared = [...cronsLine.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value !== "crons");
  assert.deepEqual(declared, [CRON_HOURLY, CRON_DAILY]);
});
