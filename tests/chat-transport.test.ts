import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MODEL_ID, DEFAULT_EFFORT } from "../src/lib/model-options.ts";
import { transport } from "../src/lib/chat-transport.ts";

const originalFetch = globalThis.fetch;

test("sendMessages posts the selected model and effort", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(new ReadableStream(), { status: 200 });
  }) as typeof fetch;
  try {
    await transport.sendMessages({
      messages: [],
      abortSignal: undefined,
      body: { modelId: "nvidia/nemotron-3.5-super-vl-120b-a12b", reasoningEffort: "high" },
    });
    assert.equal(sent.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
    assert.equal(sent.reasoningEffort, "high");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an invalid body value falls back to defaults", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(new ReadableStream(), { status: 200 });
  }) as typeof fetch;
  try {
    await transport.sendMessages({
      messages: [],
      abortSignal: undefined,
      body: { modelId: "bogus/model", reasoningEffort: "extreme" },
    });
    assert.equal(sent.model, DEFAULT_MODEL_ID);
    assert.equal(sent.reasoningEffort, DEFAULT_EFFORT);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
