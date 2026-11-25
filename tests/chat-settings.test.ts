import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EFFORT, DEFAULT_MODEL_ID } from "../src/lib/model-options.ts";
import { loadSettings, moveDraftSettings, saveSettings } from "../src/lib/chat-settings.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  },
});

test("defaults are used when nothing is stored", () => {
  store.clear();
  assert.deepEqual(loadSettings(null), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
});

test("settings are independent per thread; draft carries forward", () => {
  store.clear();
  saveSettings(null, { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  saveSettings("t1", { modelId: "google/gemma-3-12b-it", effort: "low" });
  assert.deepEqual(loadSettings("t1"), { modelId: "google/gemma-3-12b-it", effort: "low" });
  assert.deepEqual(loadSettings(null), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  moveDraftSettings("t2");
  assert.deepEqual(loadSettings("t2"), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  assert.deepEqual(loadSettings(null), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
});

test("malformed JSON and unknown values fall back to defaults", () => {
  store.clear();
  store.set("mishu:chat-settings", "{not json");
  assert.deepEqual(loadSettings("t1"), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
  saveSettings("t1", { modelId: "nvidia/nemotron-3-super-120b-a12b", effort: "extreme" } as never);
  assert.deepEqual(loadSettings("t1"), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
});
