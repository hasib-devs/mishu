import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";
import { MAX_OUTPUT_TOKENS, SYSTEM_PROMPT } from "../worker/chat-prompt.ts";
import { stubNvidiaFetch } from "./support/fake-nvidia-fetch.ts";

const env = { VITE_NVIDIA_API_KEY: "test-key", DB: {} } as never;

test("chat completions sends the professional prompt and full output budget", async () => {
  const stub = stubNvidiaFetch("A complete answer.");
  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "nvidia/nemotron-3.5-bolt-e4b",
          messages: [{ role: "user", content: "Hi" }],
        }),
      }),
      env,
    );
    // The stub answers with JSON rather than SSE; the stream may reject while
    // reading. The outgoing request is what this test pins.
    try {
      await response.text();
    } catch {
      // expected with a non-SSE stub
    }

    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0].max_tokens, MAX_OUTPUT_TOKENS);
    const messages = stub.requests[0].messages ?? [];
    assert.ok(
      messages.some(
        (message) =>
          typeof (message as { content?: unknown }).content === "string" &&
          ((message as { content: string }).content).includes(SYSTEM_PROMPT),
      ),
      "upstream request should include the system prompt",
    );
  } finally {
    stub.restore();
  }
});
