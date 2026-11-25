import assert from "node:assert/strict";
import test from "node:test";

import { aggregateSnapshot } from "../worker/free4talk/aggregate.ts";

const SCRAPED_AT = "2026-11-25T06:00:00.000Z";

test("empty rooms yields zero totals and empty arrays", () => {
  const agg = aggregateSnapshot([], SCRAPED_AT);
  assert.equal(agg.scrapedAt, SCRAPED_AT);
  assert.equal(agg.totalRooms, 0);
  assert.equal(agg.totalParticipants, 0);
  assert.deepEqual(agg.rooms, []);
  assert.deepEqual(agg.participants, []);
});

test("one room with two clients maps room, settings flags and participant details", () => {
  const agg = aggregateSnapshot(
    [
      {
        id: "room-1",
        topic: "Let's practice English",
        language: "English",
        secondLanguage: "Bangla",
        level: "Intermediate",
        maxPeople: 8,
        clients: [
          {
            id: "user-1",
            name: "Alice",
            avatar: "https://example.com/a.png",
            followers: 12,
            following: 5,
            friends: 3,
            supporter: 1,
            bio: "Hello",
          },
          { id: "user-2", name: "Bob", followers: 0, friends: 7 },
        ],
        settings: { isLocked: true, noMic: false },
        roomUrl: "https://free4talk.com/room/room-1",
        owner: {
          id: "owner-1",
          name: "Carol",
          verified: true,
          avatar: "https://example.com/c.png",
        },
        createdAt: "2026-11-25T05:00:00.000Z",
        updatedAt: "2026-11-25T05:30:00.000Z",
      },
    ],
    SCRAPED_AT,
  );

  assert.equal(agg.totalRooms, 1);
  assert.equal(agg.totalParticipants, 2);
  assert.equal(agg.rooms.length, 1);

  const room = agg.rooms[0];
  assert.equal(room.roomId, "room-1");
  assert.equal(room.topic, "Let's practice English");
  assert.equal(room.language, "English");
  assert.equal(room.secondLanguage, "Bangla");
  assert.equal(room.level, "Intermediate");
  assert.equal(room.maxPeople, 8);
  assert.equal(room.currentPeople, 2);
  assert.equal(room.isLocked, 1);
  assert.equal(room.noMic, 0);
  assert.equal(room.roomUrl, "https://free4talk.com/room/room-1");
  assert.equal(room.ownerId, "owner-1");
  assert.equal(room.ownerName, "Carol");
  assert.equal(room.ownerVerified, 1);
  assert.equal(room.ownerAvatar, "https://example.com/c.png");
  assert.equal(room.createdAt, "2026-11-25T05:00:00.000Z");
  assert.equal(room.updatedAt, "2026-11-25T05:30:00.000Z");

  assert.equal(agg.participants.length, 2);
  assert.deepEqual(agg.participants[0], {
    roomId: "room-1",
    userId: "user-1",
    name: "Alice",
    avatar: "https://example.com/a.png",
    followers: 12,
    following: 5,
    friends: 3,
    supporter: 1,
    bio: "Hello",
  });
  assert.equal(agg.participants[1].userId, "user-2");
  assert.equal(agg.participants[1].followers, 0);
  assert.equal(agg.participants[1].friends, 7);
  assert.equal(agg.participants[1].supporter, null);
});

test("empty secondLanguage becomes null", () => {
  const agg = aggregateSnapshot(
    [
      {
        id: "room-2",
        language: "English",
        secondLanguage: "",
        clients: [],
        settings: {},
        owner: { id: "o", name: "Owner" },
      },
    ],
    SCRAPED_AT,
  );
  assert.equal(agg.rooms[0].secondLanguage, null);
});

test("topic defaults to empty string when missing", () => {
  const agg = aggregateSnapshot(
    [
      {
        id: "room-3",
        language: "Spanish",
        clients: [],
        settings: {},
        owner: { id: "o", name: "Owner" },
      },
    ],
    SCRAPED_AT,
  );
  assert.equal(agg.rooms[0].topic, "");
});
