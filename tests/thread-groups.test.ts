import assert from "node:assert/strict";
import test from "node:test";

import { groupThreads } from "../src/lib/thread-groups.ts";
import type { ThreadSummary } from "../src/lib/thread-api.ts";

const now = new Date(2026, 10, 25, 12, 0, 0).getTime();
const day = 24 * 60 * 60 * 1000;

function thread(id: string, updatedAt: number): ThreadSummary {
  return { id, title: id, created_at: updatedAt - 1000, updated_at: updatedAt };
}

test("groupThreads splits sessions into Today, Yesterday and Earlier", () => {
  const groups = groupThreads([
    thread("old", now - 10 * day),
    thread("yesterday", now - day),
    thread("today", now),
  ], now);

  assert.deepEqual(groups.map((group) => group.label), ["Today", "Yesterday", "Earlier"]);
  assert.deepEqual(groups.map((group) => group.threads.map((item) => item.id)), [
    ["today"],
    ["yesterday"],
    ["old"],
  ]);
});

test("groupThreads omits empty groups", () => {
  const groups = groupThreads([
    thread("yesterday", now - day),
    thread("today", now),
  ], now);

  assert.deepEqual(groups.map((group) => group.label), ["Today", "Yesterday"]);
});
