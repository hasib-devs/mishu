import assert from "node:assert/strict";
import test from "node:test";

import { generateQuote } from "../worker/chithi-links/quote.ts";

test("generates a trimmed quote", async () => {
  const quote = await generateQuote({}, async () => "  Kindness costs nothing.  ");
  assert.equal(quote, "Kindness costs nothing.");
});

test("clamps an overlong quote to the chithi.me limit", async () => {
  const quote = await generateQuote({}, async () => "x".repeat(900));
  assert.equal(quote.length, 600);
});

test("asks for a short quote with the character limit", async () => {
  const prompts: string[] = [];
  await generateQuote({}, async (prompt) => {
    prompts.push(prompt);
    return "A quote";
  });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /quote/i);
  assert.match(prompts[0], /600/);
});

test("rejects an empty generation", async () => {
  await assert.rejects(
    () => generateQuote({}, async () => "   "),
    /empty/i,
  );
});
