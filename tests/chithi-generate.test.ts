import assert from "node:assert/strict";
import test from "node:test";
import { createFakeD1 } from "./support/fake-d1.ts";
import { dbFor } from "../worker/chithi/db.ts";
import { generateHourlyChithi } from "../worker/chithi/generate.ts";
import { stubNvidiaFetch } from "./support/fake-nvidia-fetch.ts";

const hour = 1_760_000_000_000 - (1_760_000_000_000 % 3_600_000);

test("hourly AI generation writes a letter when the model reasons before answering", async () => {
  const stub = stubNvidiaFetch("আজকের চিঠি");
  try {
    const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
    const row = await generateHourlyChithi(dbFor(fake.db), { NVIDIA_API_KEY: "test" } as never, {
      now: hour + 1000,
    });
    assert.ok(row);
    assert.equal(row!.content, "আজকের চিঠি");
    assert.equal(row!.source, "ai");
  } finally {
    stub.restore();
  }
});

test("generates an AI letter for the current hour", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const d = dbFor(fake.db);
  const row = await generateHourlyChithi(d, { NVIDIA_API_KEY: "test" } as never, {
    now: hour + 1000,
    complete: async () => "  আজকের চিঠি  ",
  });
  assert.ok(row);
  assert.equal(row!.source, "ai");
  assert.equal(row!.generated_for, hour);
  assert.equal(row!.paper_style, "classic");
  assert.equal(row!.content, "আজকের চিঠি");
});

test("returns null when the hour slot is already taken", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const d = dbFor(fake.db);
  await generateHourlyChithi(d, {} as never, { now: hour + 1000, complete: async () => "first" });
  const second = await generateHourlyChithi(d, {} as never, { now: hour + 2000, complete: async () => "second" });
  assert.equal(second, null);
});

test("throws when the model returns empty text", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const d = dbFor(fake.db);
  await assert.rejects(() => generateHourlyChithi(d, {} as never, { now: hour, complete: async () => "   " }));
});

test("uses the requested vibe in the letter prompt", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  let prompt = "";
  await generateHourlyChithi(dbFor(fake.db), {} as never, {
    now: hour + 1000,
    vibe: "মিষ্টি",
    complete: async (text) => {
      prompt = text;
      return "মিষ্টি চিঠি";
    },
  });
  assert.match(prompt, /মিষ্টি/);
  assert.doesNotMatch(prompt, /language[- ]learning/i);
});