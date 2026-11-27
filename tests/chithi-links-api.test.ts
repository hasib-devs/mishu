import assert from "node:assert/strict";
import test from "node:test";

import { triggerHourlyRun } from "../src/lib/chithi-links-api.ts";

test("posts the run token and returns the job summary", async () => {
  const original = globalThis.fetch;
  let sentToken: string | null = null;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentToken = new Headers(init?.headers).get("x-run-token");
    return new Response(JSON.stringify({ chithi: { ok: true, value: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await triggerHourlyRun("secret-token");
    assert.deepEqual(result, { chithi: { ok: true, value: 1 } });
    assert.equal(sentToken, "secret-token");
  } finally {
    globalThis.fetch = original;
  }
});

test("surfaces a rejected run as an error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  try {
    await assert.rejects(() => triggerHourlyRun("wrong"), /401/);
  } finally {
    globalThis.fetch = original;
  }
});
