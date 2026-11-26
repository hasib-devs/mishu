import assert from "node:assert/strict";
import test from "node:test";

import { upsertTargets } from "../worker/chithi-links/db.ts";
import { chithiLinksApp } from "../worker/chithi-links/routes.ts";
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
