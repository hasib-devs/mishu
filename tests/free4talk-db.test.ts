import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";

import { dailyStats, rollupAndPrune } from "../worker/free4talk/db.ts";
import { createSqliteD1 } from "./support/sqlite-d1.ts";

type D1 = Parameters<typeof dailyStats>[0];

function setup() {
  const { db, sqlite, close } = createSqliteD1();
  return { db: db as unknown as D1, sqlite, close };
}

interface SeedRoom {
  roomId: string;
  language: string;
  ownerId: string;
  people: number;
  participants?: string[];
}

/** Insert one snapshot and its rooms/participants directly into the real schema. */
function seedSnapshot(
  sqlite: DatabaseSync,
  scrapedAt: string,
  rooms: SeedRoom[],
): number {
  const totalParticipants = rooms.reduce((sum, room) => sum + room.people, 0);
  sqlite
    .prepare(
      "INSERT INTO f4t_snapshots (scraped_at, total_rooms, total_participants) " +
        "VALUES (?, ?, ?)",
    )
    .run(scrapedAt, rooms.length, totalParticipants);

  const row = sqlite
    .prepare("SELECT id FROM f4t_snapshots WHERE scraped_at = ?")
    .get(scrapedAt);
  assert.ok(row);
  const snapshotId = Number(row.id);

  for (const room of rooms) {
    sqlite
      .prepare(
        "INSERT INTO f4t_rooms " +
          "(snapshot_id, room_id, language, current_people, owner_id, owner_name) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        snapshotId,
        room.roomId,
        room.language,
        room.people,
        room.ownerId,
        `Owner ${room.ownerId}`,
      );
    for (const userId of room.participants ?? []) {
      sqlite
        .prepare(
          "INSERT INTO f4t_participants (snapshot_id, room_id, user_id, name) " +
            "VALUES (?, ?, ?, ?)",
        )
        .run(snapshotId, room.roomId, userId, `User ${userId}`);
    }
  }
  return snapshotId;
}

function seedDailyStat(
  sqlite: DatabaseSync,
  day: string,
  language: string,
  avgRooms: number,
  peakHour: number,
): void {
  sqlite
    .prepare(
      "INSERT INTO f4t_daily_stats " +
        "(day, language, avg_rooms, peak_rooms, peak_participants, peak_hour, unique_owners) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(day, language, avgRooms, avgRooms, avgRooms, peakHour, 1);
}

function count(sqlite: DatabaseSync, sql: string, ...args: unknown[]): number {
  const row = sqlite.prepare(sql).get(...args.map((a) => (a === undefined ? null : a)));
  assert.ok(row);
  return Number(row.n);
}

test("dailyStats returns all languages for each of the last N distinct days", async () => {
  const { db, sqlite, close } = setup();
  try {
    for (const day of ["2026-11-23", "2026-11-24", "2026-11-25"]) {
      seedDailyStat(sqlite, day, "English", 1, 6);
      seedDailyStat(sqlite, day, "Spanish", 2, 18);
    }

    const rows = await dailyStats(db, 2);

    // 2 days x 2 languages — not 2 rows from the newest day.
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((row) => `${row.day}:${row.language}`),
      [
        "2026-11-25:English",
        "2026-11-25:Spanish",
        "2026-11-24:English",
        "2026-11-24:Spanish",
      ],
    );
    // snake_case to camelCase mapping is preserved.
    assert.deepEqual(rows[0], {
      day: "2026-11-25",
      language: "English",
      avgRooms: 1,
      peakRooms: 1,
      peakParticipants: 1,
      peakHour: 6,
      uniqueOwners: 1,
    });
  } finally {
    close();
  }
});

test("rollupAndPrune computes per-language stats, writes rollup before pruning, and cascades", async () => {
  const { db, sqlite, close } = setup();
  try {
    const keptId = seedSnapshot(sqlite, "2026-11-24T12:00:00.000Z", [
      { roomId: "kept-1", language: "English", ownerId: "kept-owner", people: 1 },
    ]);
    const firstId = seedSnapshot(sqlite, "2026-11-25T06:00:00.000Z", [
      { roomId: "e1", language: "English", ownerId: "o1", people: 3, participants: ["u1", "u2", "u3"] },
      { roomId: "e2", language: "English", ownerId: "o2", people: 2, participants: ["u4", "u5"] },
      { roomId: "s1", language: "Spanish", ownerId: "o3", people: 4, participants: ["u6", "u7"] },
    ]);
    const secondId = seedSnapshot(sqlite, "2026-11-25T18:00:00.000Z", [
      { roomId: "e3", language: "English", ownerId: "o1", people: 6 },
      { roomId: "e4", language: "English", ownerId: "o4", people: 5 },
      { roomId: "e5", language: "English", ownerId: "o5", people: 1 },
      { roomId: "e6", language: "English", ownerId: "o6", people: 1 },
      { roomId: "s2", language: "Spanish", ownerId: "o3", people: 3 },
      { roomId: "s3", language: "Spanish", ownerId: "o7", people: 2 },
    ]);

    await rollupAndPrune(db, "2026-11-25");

    // avg(2,4)=3, avg(1,2)=1.5 -> ROUND -> 2; peak_hour is the hour of the
    // snapshot with the most participants for that language.
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT day, language, avg_rooms, peak_rooms, peak_participants, " +
            "peak_hour, unique_owners FROM f4t_daily_stats ORDER BY language",
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          day: "2026-11-25",
          language: "English",
          avg_rooms: 3,
          peak_rooms: 4,
          peak_participants: 13,
          peak_hour: 18,
          unique_owners: 5,
        },
        {
          day: "2026-11-25",
          language: "Spanish",
          avg_rooms: 2,
          peak_rooms: 2,
          peak_participants: 5,
          peak_hour: 18,
          unique_owners: 2,
        },
      ],
    );

    // The rolled-up rows survive while the raw day is gone: the rollup is
    // written before the DELETE, in the same batch.
    assert.equal(
      count(sqlite, "SELECT COUNT(*) AS n FROM f4t_snapshots WHERE date(scraped_at) = ?", "2026-11-25"),
      0,
    );
    assert.equal(
      count(sqlite, "SELECT COUNT(*) AS n FROM f4t_rooms WHERE snapshot_id IN (?, ?)", firstId, secondId),
      0,
    );
    assert.equal(
      count(sqlite, "SELECT COUNT(*) AS n FROM f4t_participants WHERE snapshot_id IN (?, ?)", firstId, secondId),
      0,
    );

    // Other days are untouched by the prune.
    assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM f4t_snapshots WHERE id = ?", keptId), 1);
    assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM f4t_rooms WHERE snapshot_id = ?", keptId), 1);
    assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM f4t_participants WHERE snapshot_id = ?", keptId), 0);
  } finally {
    close();
  }
});

test("rollupAndPrune deletes a day whose snapshots have no language rows", async () => {
  const { db, sqlite, close } = setup();
  try {
    const emptyId = seedSnapshot(sqlite, "2026-11-25T09:00:00.000Z", []);

    await rollupAndPrune(db, "2026-11-25");

    // No languages matched, but the DELETE still ran.
    assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM f4t_snapshots WHERE id = ?", emptyId), 0);
    assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM f4t_daily_stats"), 0);
  } finally {
    close();
  }
});
