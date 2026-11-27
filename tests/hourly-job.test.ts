import assert from "node:assert/strict";
import test from "node:test";

import { runHourlyJobs } from "../worker/hourly.ts";

const env = {} as Env;
const scrape = { snapshotId: 1, totalRooms: 2, totalParticipants: 3 };
const links = { discovered: 4, verified: 4, rejected: 0, sent: 4, failed: 0 };

test("runs chithi, scrape and links in order and returns each result", async () => {
  const calls: string[] = [];
  const result = await runHourlyJobs(env, {
    chithi: async () => {
      calls.push("chithi");
      return "chithi-7";
    },
    scrape: async () => {
      calls.push("scrape");
      return scrape;
    },
    links: async () => {
      calls.push("links");
      return links;
    },
  });
  assert.deepEqual(calls, ["chithi", "scrape", "links"]);
  assert.deepEqual(result.chithi, { ok: true, value: "chithi-7" });
  assert.deepEqual(result.scrape, { ok: true, value: scrape });
  assert.deepEqual(result.links, { ok: true, value: links });
});

test("a chithi failure does not stop the scrape or the link pipeline", async () => {
  const result = await runHourlyJobs(env, {
    chithi: async () => {
      throw new Error("AI down");
    },
    scrape: async () => scrape,
    links: async () => links,
  });
  assert.deepEqual(result.chithi, { ok: false, error: "AI down" });
  assert.deepEqual(result.links, { ok: true, value: links });
});

test("a scrape failure skips the link pipeline and reports why", async () => {
  let linksCalled = false;
  const result = await runHourlyJobs(env, {
    chithi: async () => null,
    scrape: async () => {
      throw new Error("browser down");
    },
    links: async () => {
      linksCalled = true;
      return links;
    },
  });
  assert.equal(linksCalled, false);
  assert.deepEqual(result.scrape, { ok: false, error: "browser down" });
  assert.deepEqual(result.links, { ok: false, error: "scrape failed" });
});
