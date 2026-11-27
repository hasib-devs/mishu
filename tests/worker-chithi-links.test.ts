import assert from "node:assert/strict";
import test from "node:test";

import { upsertTargets } from "../worker/chithi-links/db.ts";
import { chithiLinksApp, createChithiLinksApp } from "../worker/chithi-links/routes.ts";
import { createSqliteD1 } from "./support/sqlite-d1.ts";

function setup() {
  const { db, close } = createSqliteD1();
  const env = { DB: db } as unknown as Env;
  return { db: db as unknown as Parameters<typeof upsertTargets>[0], env, close };
}

function get(path: string, env: Env) {
  return chithiLinksApp.fetch(
    new Request(`https://example.com${path}`),
    env,
    {} as ExecutionContext,
  );
}

test("GET /api/chithi-links returns the discovered targets", async () => {
  const { db, env, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "user_bio" },
    ], 1000);
    const response = await get("/api/chithi-links", env);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { username: string }[];
    assert.deepEqual(body.map((row) => row.username), ["B", "A"]);
  } finally {
    close();
  }
});

test("limit query bounds the result", async () => {
  const { db, env, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "user_bio" },
    ], 1000);
    const response = await get("/api/chithi-links?limit=1", env);
    const body = (await response.json()) as { username: string }[];
    assert.equal(body.length, 1);
  } finally {
    close();
  }
});

test("unknown chithi-links subpaths return the sub-app 404", async () => {
  const { env, close } = setup();
  try {
    const response = await get("/api/chithi-links/nope", env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  } finally {
    close();
  }
});

test("CORS preflight is answered by the sub-app", async () => {
  const { env, close } = setup();
  try {
    const response = await chithiLinksApp.fetch(
      new Request("https://example.com/api/chithi-links", {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
      env,
      {} as ExecutionContext,
    );
    assert.ok(response.ok);
    assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /GET/);
  } finally {
    close();
  }
});

const summary = {
  chithi: { ok: true, value: "chithi-1" },
  scrape: { ok: true, value: { snapshotId: 1, totalRooms: 0, totalParticipants: 0 } },
  links: { ok: true, value: { discovered: 0, verified: 0, rejected: 0, sent: 0, failed: 0 } },
};

function post(path: string, env: Env, token?: string, app = createChithiLinksApp(async () => summary)) {
  const headers: Record<string, string> = {};
  if (token) headers["X-Run-Token"] = token;
  return app.fetch(
    new Request(`https://example.com${path}`, { method: "POST", headers }),
    env,
    {} as ExecutionContext,
  );
}

test("manual run is unavailable when no token secret is configured", async () => {
  const { env, close } = setup();
  try {
    const response = await post("/api/chithi-links/run", env, "anything");
    assert.equal(response.status, 503);
  } finally {
    close();
  }
});

test("manual run rejects a missing or wrong token", async () => {
  const { env, close } = setup();
  const guarded = { ...env, MANUAL_RUN_TOKEN: "right" } as Env;
  try {
    assert.equal((await post("/api/chithi-links/run", guarded)).status, 401);
    assert.equal((await post("/api/chithi-links/run", guarded, "wrong")).status, 401);
  } finally {
    close();
  }
});

test("manual run returns the hourly job summary", async () => {
  const { env, close } = setup();
  const guarded = { ...env, MANUAL_RUN_TOKEN: "right" } as Env;
  let calls = 0;
  const app = createChithiLinksApp(async () => {
    calls += 1;
    return summary;
  });
  try {
    const response = await post("/api/chithi-links/run", guarded, "right", app);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), summary);
    assert.equal(calls, 1);
  } finally {
    close();
  }
});

test("a second manual run is rejected while the first is still running", async () => {
  const { env, close } = setup();
  const guarded = { ...env, MANUAL_RUN_TOKEN: "right" } as Env;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const app = createChithiLinksApp(async () => {
    await gate;
    return summary;
  });
  try {
    const first = post("/api/chithi-links/run", guarded, "right", app);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await post("/api/chithi-links/run", guarded, "right", app);
    assert.equal(second.status, 409);
    release();
    assert.equal((await first).status, 200);
  } finally {
    release();
    close();
  }
});
