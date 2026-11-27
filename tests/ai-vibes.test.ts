import assert from "node:assert/strict";
import test from "node:test";

import { VIBES } from "../worker/ai-vibes.ts";
import { letterPrompt } from "../worker/chithi/generate.ts";
import { quotePrompt } from "../worker/chithi-links/quote.ts";

const requested = [
  "friendly",
  "sweet",
  "cute",
  "lovely",
  "motivational",
  "মিষ্টি",
  "আদুরে",
  "flirty",
  "রোমান্টিক",
  "নীরব কষ্টের",
  "soft and lovely",
  "morning",
  "midnight",
  "inspirational",
  "career",
];

test("the vibe palette covers the requested moods, including Bengali ones", () => {
  for (const vibe of requested) {
    assert.ok(
      VIBES.some((item) => item.toLowerCase().includes(vibe)),
      `missing vibe: ${vibe}`,
    );
  }
});

test("the letter prompt is not language-learning specific and carries the vibe", () => {
  const prompt = letterPrompt("flirty");
  assert.match(prompt, /flirty/i);
  assert.match(prompt, /Bengali|Bangla/i);
  assert.doesNotMatch(prompt, /language[- ]learning/i);
  assert.doesNotMatch(prompt, /language exchange/i);
});

test("the quote prompt is not language-learning specific and carries the vibe", () => {
  const prompt = quotePrompt("নীরব কষ্টের", ["old quote"]);
  assert.match(prompt, /নীরব কষ্টের/);
  assert.match(prompt, /old quote/);
  assert.doesNotMatch(prompt, /language[- ]learning/i);
});
