import assert from "node:assert/strict";
import test from "node:test";

import { extractRooms, toRawRoom } from "../worker/free4talk/parse.ts";

/** Shape captured from the live sync/get/free4talk/groups response. */
const liveRoom = {
  id: "6b089c0d2a4ce5002e788c16",
  channel: "free4talk",
  platform: "Free4Talk",
  topic: "Practice English https://chithi.me/Aurth0",
  language: "English",
  secondLanguage: "French",
  level: "Advanced",
  maxPeople: 2,
  url: "https://www.free4talk.com/room/4A3ff",
  userId: "NURII5E903UL",
  creator: {
    id: "NURII5E903UL",
    name: "Mr D",
    avatar: "https://browser.free4talk.com/browser/avatar/v1/NURII5E903UL",
    isVerified: true,
  },
  clients: [
    { id: "RV8811U528LM", name: "Darya", followers: 37, following: 28, friends: 29 },
  ],
  settings: { noMic: false, alMic: 0, isLocked: false },
  createdAt: "2026-11-26T20:52:29.353Z",
  updatedAt: "2026-11-26T20:52:29.353Z",
};

test("extracts rooms from the live data-as-object-map payload", () => {
  const payload = {
    success: true,
    error: null,
    data: { [liveRoom.id]: liveRoom },
  };
  const rooms = extractRooms(payload);
  assert.equal(rooms.length, 1);
  assert.deepEqual(rooms[0], liveRoom);
});

test("maps a live room using creator as owner and url as roomUrl", () => {
  const room = toRawRoom(liveRoom);
  assert.ok(room);
  assert.equal(room.id, liveRoom.id);
  assert.equal(room.topic, liveRoom.topic);
  assert.equal(room.language, "English");
  assert.equal(room.roomUrl, "https://www.free4talk.com/room/4A3ff");
  assert.equal(room.owner.id, "NURII5E903UL");
  assert.equal(room.owner.name, "Mr D");
  assert.equal(room.clients?.length, 1);
});

test("still accepts the older array and data.rooms shapes", () => {
  assert.equal(extractRooms([liveRoom]).length, 1);
  assert.equal(extractRooms({ rooms: [liveRoom] }).length, 1);
  assert.equal(extractRooms({ data: { rooms: [liveRoom] } }).length, 1);
});

test("rejects rooms without a creator or language", () => {
  const { creator: _creator, ...noCreator } = liveRoom;
  void _creator;
  assert.equal(toRawRoom(noCreator), null);
  assert.equal(toRawRoom({ ...liveRoom, language: undefined }), null);
});
