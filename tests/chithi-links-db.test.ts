import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";

import {
  listActiveTargets,
  listTargets,
  listUnsentTargets,
  listUsedQuotes,
  markSendFailed,
  markSent,
  markNotSeen,
  markUnverified,
  markVerified,
  readLatestSnapshotTexts,
  upsertTargets,
} from "../worker/chithi-links/db.ts";
import { createSqliteD1 } from "./support/sqlite-d1.ts";

type D1 = Parameters<typeof listTargets>[0];

function setup() {
  const { db, sqlite, close } = createSqliteD1();
  return { db: db as unknown as D1, sqlite, close };
}

function seedSnapshot(sqlite: DatabaseSync, scrapedAt: string, topics: string[], bios: string[]) {
  sqlite
    .prepare("INSERT INTO f4t_snapshots (scraped_at, total_rooms, total_participants) VALUES (?, ?, ?)")
    .run(scrapedAt, topics.length, bios.length);
  const row = sqlite.prepare("SELECT id FROM f4t_snapshots WHERE scraped_at = ?").get(scrapedAt);
  assert.ok(row);
  const snapshotId = Number(row.id);
  topics.forEach((topic, i) => {
    sqlite
      .prepare("INSERT INTO f4t_rooms (snapshot_id, room_id, topic, language, current_people, owner_id, owner_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(snapshotId, `r${i}`, topic, "en", 1, "o1", "Owner");
  });
  bios.forEach((bio, i) => {
    sqlite
      .prepare("INSERT INTO f4t_participants (snapshot_id, room_id, user_id, name, bio) VALUES (?, ?, ?, ?, ?)")
      .run(snapshotId, "r0", `u${i}`, `User ${i}`, bio);
  });
}

test("readLatestSnapshotTexts reads only the newest snapshot", async () => {
  const { db, sqlite, close } = setup();
  try {
    seedSnapshot(sqlite, "2026-11-26T10:00:00Z", ["old topic"], ["old bio"]);
    seedSnapshot(sqlite, "2026-11-27T10:00:00Z", ["topic A", "topic B"], ["bio A"]);
    assert.deepEqual(await readLatestSnapshotTexts(db), {
      topics: ["topic A", "topic B"],
      bios: ["bio A"],
    });
  } finally {
    close();
  }
});

test("upsertTargets inserts new users once and refreshes last_seen_at", async () => {
  const { db, close } = setup();
  try {
    assert.equal(
      await upsertTargets(db, [
        { username: "Aurth0", source: "room_topic" },
        { username: "Bob", source: "user_bio" },
      ], 1000),
      2,
    );
    assert.equal(
      await upsertTargets(db, [
        { username: "aurth0", source: "user_bio" },
        { username: "Carol", source: "user_bio" },
      ], 2000),
      1,
    );

    const rows = await listTargets(db, 10);
    assert.equal(rows.length, 3);
    const aurth0 = rows.find((row) => row.username === "Aurth0");
    assert.ok(aurth0);
    assert.equal(aurth0.source, "room_topic");
    assert.equal(aurth0.firstSeenAt, 1000);
    assert.equal(aurth0.lastSeenAt, 2000);
  } finally {
    close();
  }
});

test("listTargets is newest-first and bounded by limit", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "room_topic" },
    ], 1000);
    await upsertTargets(db, [{ username: "C", source: "user_bio" }], 2000);
    assert.deepEqual((await listTargets(db, 2)).map((row) => row.username), ["C", "B"]);
  } finally {
    close();
  }
});

test("mark functions drive active, verified and sent state", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "room_topic" },
      { username: "C", source: "room_topic" },
    ], 1000);

    await markVerified(db, "A", "pid-a", 1100, 1);
    await markUnverified(db, "B", 1200, "paused");
    await markSent(db, "A", 1300, "quote one");
    await markSent(db, "A", 1400, "quote two");
    await markSendFailed(db, "C", 1500, "browser down");

    const rows = await listTargets(db, 10);
    const a = rows.find((row) => row.username === "A")!;
    const b = rows.find((row) => row.username === "B")!;
    const c = rows.find((row) => row.username === "C")!;

    assert.equal(a.profileId, "pid-a");
    assert.equal(a.verifiedAt, 1100);
    assert.equal(a.lastSentAt, 1400);
    assert.equal(a.lastQuote, "quote two");
    assert.equal(a.sendCount, 2);
    assert.equal(b.active, 0);
    assert.equal(b.lastError, "paused");
    assert.equal(c.lastError, "browser down");
    assert.deepEqual((await listUnsentTargets(db, 10)).map((row) => row.username), ["C"]);
  } finally {
    close();
  }
});

test("listUnsentTargets honours the limit", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "room_topic" },
    ], 1000);
    assert.deepEqual((await listUnsentTargets(db, 1)).map((row) => row.username), ["B"]);
  } finally {
    close();
  }
});

test("listUsedQuotes returns distinct sent quotes, newest first, within the limit", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "room_topic" },
      { username: "C", source: "room_topic" },
    ], 1000);
    await markSent(db, "A", 1100, "quote one");
    await markSent(db, "B", 1200, "quote one");
    await markSent(db, "C", 1300, "quote two");
    assert.deepEqual(await listUsedQuotes(db, 10), ["quote two", "quote one"]);
    assert.deepEqual(await listUsedQuotes(db, 1), ["quote two"]);
  } finally {
    close();
  }
});

test("listUsedQuotes keeps every quote sent to a target across re-sends", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [{ username: "A", source: "room_topic" }], 1000);
    await markSent(db, "A", 1100, "first quote");
    await markSent(db, "A", 1200, "second quote");
    assert.deepEqual(await listUsedQuotes(db, 10), ["second quote", "first quote"]);
  } finally {
    close();
  }
});

test("markNotSeen deactivates a target without changing verified_at", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [{ username: "A", source: "room_topic" }], 1000);
    await markVerified(db, "A", "pid-a", 1100, 1);
    await markNotSeen(db, "A", 1200, "link not in latest snapshot");
    const a = (await listTargets(db, 10))[0];
    assert.equal(a.active, 0);
    assert.equal(a.verifiedAt, 1100);
    assert.match(a.lastError!, /snapshot/i);
  } finally {
    close();
  }
});

test("listActiveTargets includes already-sent targets and excludes inactive ones", async () => {
  const { db, close } = setup();
  try {
    await upsertTargets(db, [
      { username: "A", source: "room_topic" },
      { username: "B", source: "room_topic" },
      { username: "C", source: "room_topic" },
    ], 1000);
    await markSent(db, "A", 1100, "old quote");
    await markVerified(db, "B", "pid-b", 1200, 1);
    await markUnverified(db, "C", 1300, "paused");
    assert.deepEqual((await listActiveTargets(db, 10)).map((r) => r.username).sort(), ["A", "B"]);
    assert.equal((await listActiveTargets(db, 1)).length, 1);
  } finally {
    close();
  }
});
