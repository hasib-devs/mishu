import assert from "node:assert/strict";
import test from "node:test";

import {
  listTargets,
  markSent,
  markVerified,
  readLatestSnapshotTexts,
  upsertTargets,
} from "../worker/chithi-links/db.ts";
import { runChithiLinkPipeline } from "../worker/chithi-links/pipeline.ts";
import { createSqliteD1 } from "./support/sqlite-d1.ts";

type D1 = Parameters<typeof runChithiLinkPipeline>[1];

function setup(topics: string[], bios: string[]) {
  const { db, sqlite, close } = createSqliteD1();
  const d1 = db as unknown as D1;
  sqlite
    .prepare("INSERT INTO f4t_snapshots (scraped_at, total_rooms, total_participants) VALUES (?, ?, ?)")
    .run("2026-11-27T10:00:00Z", topics.length, bios.length);
  const row = sqlite.prepare("SELECT id FROM f4t_snapshots LIMIT 1").get() as { id: number };
  topics.forEach((topic, i) => {
    sqlite
      .prepare("INSERT INTO f4t_rooms (snapshot_id, room_id, topic, language, current_people, owner_id, owner_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, `r${i}`, topic, "en", 1, "o", "Owner");
  });
  bios.forEach((bio, i) => {
    sqlite
      .prepare("INSERT INTO f4t_participants (snapshot_id, room_id, user_id, name, bio) VALUES (?, ?, ?, ?, ?)")
      .run(row.id, "r0", `u${i}`, `User ${i}`, bio);
  });
  return { db: d1, sqlite, close };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    readTexts: readLatestSnapshotTexts,
    verify: async (username: string) => ({ id: `pid-${username}`, username, paused: false }),
    generate: async () => "a fresh quote",
    send: async (items: { username: string }[]) => items.map((item) => ({ username: item.username, ok: true })),
    now: 1000,
    ...overrides,
  };
}

test("discovers, verifies and sends to targets from topics and bios", async () => {
  const { db, close } = setup(
    ["chat https://chithi.me/A here"],
    ["my link: chithi.me/B"],
  );
  try {
    const result = await runChithiLinkPipeline({} as Env, db, deps());
    assert.deepEqual(result, { discovered: 2, verified: 2, rejected: 0, sent: 2, failed: 0 });

    const rows = await listTargets(db, 10);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.verifiedAt === 1000 && row.lastSentAt === 1000));
    assert.equal(rows.find((row) => row.username === "A")?.source, "room_topic");
    assert.equal(rows.find((row) => row.username === "B")?.source, "user_bio");
  } finally {
    close();
  }
});

test("a link found in both a topic and a bio is stored once", async () => {
  const { db, close } = setup(["https://chithi.me/A"], ["https://chithi.me/a"]);
  try {
    const result = await runChithiLinkPipeline({} as Env, db, deps());
    assert.equal(result.discovered, 1);
    assert.equal((await listTargets(db, 10))[0].source, "room_topic");
  } finally {
    close();
  }
});

test("already-verified targets are not verified again but can be sent to", async () => {
  const { db, close } = setup(["https://chithi.me/A"], []);
  try {
    await upsertTargets(db, [{ username: "A", source: "room_topic" }], 500);
    await markVerified(db, "A", "pid-a", 600, 1);
    let verifyCalls = 0;
    const result = await runChithiLinkPipeline(
      {} as Env,
      db,
      deps({
        verify: async (username: string) => {
          verifyCalls += 1;
          return { id: `pid-${username}`, username, paused: false };
        },
      }),
    );
    assert.equal(verifyCalls, 0);
    assert.deepEqual(result, { discovered: 0, verified: 0, rejected: 0, sent: 1, failed: 0 });
  } finally {
    close();
  }
});

test("invalid or paused profiles are rejected and never sent to", async () => {
  const { db, close } = setup(["https://chithi.me/A"], []);
  try {
    const result = await runChithiLinkPipeline({} as Env, db, deps({ verify: async () => null }));
    assert.equal(result.rejected, 1);
    assert.equal(result.sent, 0);
    const row = (await listTargets(db, 10))[0];
    assert.equal(row.active, 0);
    assert.ok(row.lastError);
  } finally {
    close();
  }
});

test("the per-run send cap is honoured", async () => {
  const { db, close } = setup(
    ["https://chithi.me/A", "https://chithi.me/B", "https://chithi.me/C"],
    [],
  );
  try {
    let sent: string[] = [];
    const result = await runChithiLinkPipeline(
      {} as Env,
      db,
      deps({
        maxSends: 2,
        send: async (items: { username: string }[]) => {
          sent = items.map((item) => item.username);
          return items.map((item) => ({ username: item.username, ok: true }));
        },
      }),
    );
    assert.equal(sent.length, 2);
    assert.equal(result.sent, 2);
    assert.equal((await listTargets(db, 10)).filter((row) => row.lastSentAt !== null).length, 2);
  } finally {
    close();
  }
});

test("already-sent users are skipped on later runs", async () => {
  const { db, close } = setup(["https://chithi.me/A"], []);
  try {
    await upsertTargets(db, [{ username: "A", source: "room_topic" }], 500);
    await markVerified(db, "A", "pid-a", 600, 1);
    await markSent(db, "A", 700, "old quote");
    const result = await runChithiLinkPipeline({} as Env, db, deps());
    assert.equal(result.sent, 0);
    assert.equal((await listTargets(db, 10))[0].lastQuote, "old quote");
  } finally {
    close();
  }
});

test("a failed send is recorded without blocking the next run", async () => {
  const { db, close } = setup(["https://chithi.me/A", "https://chithi.me/B"], []);
  try {
    const result = await runChithiLinkPipeline(
      {} as Env,
      db,
      deps({
        send: async (items: { username: string }[]) =>
          items.map((item) => ({
            username: item.username,
            ok: item.username !== "A",
            error: item.username === "A" ? "timeout" : undefined,
          })),
      }),
    );
    assert.deepEqual(result, { discovered: 2, verified: 2, rejected: 0, sent: 1, failed: 1 });
    const a = (await listTargets(db, 10)).find((row) => row.username === "A")!;
    assert.equal(a.lastSentAt, null);
    assert.equal(a.lastError, "timeout");

    const retry = await runChithiLinkPipeline({} as Env, db, deps({ now: 2000 }));
    assert.equal(retry.sent, 1);
  } finally {
    close();
  }
});

test("a generation failure counts as failed and is not sent", async () => {
  const { db, close } = setup(["https://chithi.me/A", "https://chithi.me/B"], []);
  try {
    const result = await runChithiLinkPipeline(
      {} as Env,
      db,
      deps({
        generate: async () => {
          throw new Error("AI unavailable");
        },
      }),
    );
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 2);
    assert.ok((await listTargets(db, 10)).every((row) => row.lastError === "AI unavailable"));
  } finally {
    close();
  }
});
