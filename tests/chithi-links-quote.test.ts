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

test("does not return a quote that was already used", async () => {
  const used = "Courage is not the absence of fear, but the triumph over it.";
  const prompts: string[] = [];
  const quote = await generateQuote(
    {},
    async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1 ? used : "Fortune favors the bold.";
    },
    { avoid: [used] },
  );
  assert.equal(quote, "Fortune favors the bold.");
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /already used/i);
  assert.match(prompts[0], /Courage is not the absence of fear/);
});

test("gives up instead of sending a duplicate quote", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateQuote(
        {},
        async () => {
          calls += 1;
          return "Same quote.";
        },
        { avoid: ["Same quote."] },
      ),
    /duplicate/i,
  );
  assert.equal(calls, 3);
});
