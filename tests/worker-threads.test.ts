import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";
import { createFakeD1 } from "./support/fake-d1.ts";

const base = "https://example.test";
const thread = { id: "t1", title: "New Thread", created_at: 1, updated_at: 1 };

function envFor(fake: ReturnType<typeof createFakeD1>) {
  return { DB: fake.db, VITE_NVIDIA_API_KEY: "test-key" } as never;
}

function putMessages(messages: unknown[], threadId = "t1") {
  return new Request(`${base}/api/threads/${threadId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    duplex: "half",
  } as RequestInit);
}

test("PUT replaces the message set, stores parts, and titles the thread from the first user message", async () => {
  const fake = createFakeD1({
    threads: [{ ...thread }],
    messages: [{ id: "old", thread_id: "t1", role: "user", content: "old", created_at: 2 }],
  }, 5000);

  const response = await worker.fetch(putMessages([
    { id: "u1", role: "user", content: "Hello there", parts: [{ type: "text", text: "Hello there" }] },
    { id: "a1", role: "assistant", content: "Hi", parts: [{ type: "text", text: "Hi" }] },
  ]), envFor(fake));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(fake.state.messages.length, 2);
  assert.deepEqual(fake.state.messages.map((row) => row.id), ["u1", "a1"]);
  assert.equal(fake.state.messages[0].parts, JSON.stringify([{ type: "text", text: "Hello there" }]));
  assert.equal(fake.state.threads[0].title, "Hello there");
  assert.ok(typeof fake.state.threads[0].updated_at === "number" && fake.state.threads[0].updated_at >= 5000);
});

test("PUT on a missing thread returns 404 and leaves no messages", async () => {
  const fake = createFakeD1({ threads: [{ ...thread }], messages: [] });
  const response = await worker.fetch(putMessages([
    { id: "u1", role: "user", content: "Hello", parts: [] },
  ], "missing"), envFor(fake));

  assert.equal(response.status, 404);
  assert.equal(fake.state.messages.length, 0);
});

test("PUT rejects a non-string id and an unsupported role with 400", async () => {
  const fake = createFakeD1({ threads: [{ ...thread }], messages: [] });

  const badId = await worker.fetch(putMessages([
    { id: 42, role: "user", content: "Hello", parts: [] },
  ]), envFor(fake));
  assert.equal(badId.status, 400);

  const badRole = await worker.fetch(putMessages([
    { id: "u1", role: "nonsense", content: "Hello", parts: [] },
  ]), envFor(fake));
  assert.equal(badRole.status, 400);
});

test("GET decodes stored parts and returns null for legacy rows", async () => {
  const fake = createFakeD1({
    threads: [{ ...thread }],
    messages: [
      { id: "u1", thread_id: "t1", role: "user", content: "Hi", parts: JSON.stringify([{ type: "text", text: "Hi" }]), created_at: 2 },
      { id: "old", thread_id: "t1", role: "assistant", content: "Legacy", created_at: 3 },
    ],
  });

  const response = await worker.fetch(new Request(`${base}/api/threads/t1`), envFor(fake));
  assert.equal(response.status, 200);
  const body = await response.json() as { messages: Array<{ parts: unknown[] | null }> };
  assert.deepEqual(body.messages[0].parts, [{ type: "text", text: "Hi" }]);
  assert.equal(body.messages[1].parts, null);
});
