import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";
import { CRON_DAILY, CRON_HOURLY, nextRunAfter } from "../worker/schedule.ts";

test("GET /api/schedule returns both next runs anchored to serverNow", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls++;
    return new Response(null, { status: 404 });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/schedule"), {} as Env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const body = await response.json() as { serverNow: number; jobs: Array<{ id: string; nextRunAt: number }> };
    assert.deepEqual(body.jobs.map((job) => job.id), ["hourly", "daily"]);
    for (const job of body.jobs) {
      assert.ok(job.nextRunAt > body.serverNow);
      assert.equal(job.nextRunAt, nextRunAfter(job.id === "hourly" ? CRON_HOURLY : CRON_DAILY, body.serverNow));
    }
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
