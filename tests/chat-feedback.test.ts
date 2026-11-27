import assert from "node:assert/strict";
import test from "node:test";

import { getFeedback, setFeedback } from "../src/lib/chat-feedback.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  },
});

test("feedback is independent per message and thread", () => {
  store.clear();
  setFeedback("t1", "a1", "up");
  setFeedback("t2", "a1", "down");

  assert.equal(getFeedback("t1", "a1"), "up");
  assert.equal(getFeedback("t2", "a1"), "down");
  assert.equal(getFeedback("t1", "a2"), null);
});

test("clearing a vote removes it", () => {
  store.clear();
  setFeedback("t1", "a1", "up");
  setFeedback("t1", "a1", null);

  assert.equal(getFeedback("t1", "a1"), null);
});

test("malformed storage and invalid votes fall back to null", () => {
  store.clear();
  store.set("mishu:chat-feedback", "{bad");
  assert.equal(getFeedback("t1", "a1"), null);

  store.set("mishu:chat-feedback", JSON.stringify({ t1: { a1: "sideways" } }));
  assert.equal(getFeedback("t1", "a1"), null);
});

test("a storage failure never throws", () => {
  const originalSetItem = localStorage.setItem;
  Object.defineProperty(localStorage, "setItem", {
    configurable: true,
    value: () => { throw new Error("storage full"); },
  });
  try {
    assert.doesNotThrow(() => setFeedback("t1", "a1", "up"));
  } finally {
    Object.defineProperty(localStorage, "setItem", {
      configurable: true,
      value: originalSetItem,
    });
  }
});
