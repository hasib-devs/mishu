import assert from "node:assert/strict";
import test from "node:test";

import { generateQuote } from "../worker/chithi-links/quote.ts";
import { stubNvidiaFetch } from "./support/fake-nvidia-fetch.ts";

test("generates a quote when the model reasons before answering", async () => {
  const stub = stubNvidiaFetch("Kindness costs nothing.");
  try {
    const quote = await generateQuote({ NVIDIA_API_KEY: "test" } as never);
    assert.equal(quote, "Kindness costs nothing.");
  } finally {
    stub.restore();
  }
});

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
