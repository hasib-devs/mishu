import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";

function completion(body: unknown) {
  return new Request("https://example.test/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half",
  } as RequestInit);
}
const env = { VITE_NVIDIA_API_KEY: "test-key", DB: {} } as never;

test("an unknown model id is rejected with 400", async () => {
  const response = await worker.fetch(
    completion({ modelId: "nvidia/nemotron-3-super-120b-a12b", messages: [] }),
    env,
  );
  assert.equal(response.status, 400);
});

test("an unsupported effort is rejected with 400", async () => {
  const response = await worker.fetch(
    completion({ modelId: "nvidia/nemotron-3.5-bolt-e4b", reasoningEffort: "extreme", messages: [] }),
    env,
  );
  assert.equal(response.status, 400);
});
