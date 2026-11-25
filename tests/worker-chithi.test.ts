import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.ts";
import { createFakeD1 } from "./support/fake-d1.ts";

const base = "https://example.test";
function envFor(fake: ReturnType<typeof createFakeD1>) {
  return { DB: fake.db, VITE_NVIDIA_API_KEY: "test-key" } as never;
}
function json(path: string, method: string, body?: object) {
  return new Request(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), duplex: "half",
  } as RequestInit);
}

test("POST creates a letter and GET list/get-id return it", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const created = await worker.fetch(json("/api/chithis", "POST", { content: "চিঠি" }), envFor(fake));
  assert.equal(created.status, 201);
  const row = await created.json() as { id: string; content: string; source: string };
  assert.equal(row.content, "চিঠি");
  assert.equal(row.source, "manual");
  const list = await worker.fetch(new Request(`${base}/api/chithis`), envFor(fake));
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json() as Array<{ id: string }>).map((r) => r.id), [row.id]);
  const one = await worker.fetch(new Request(`${base}/api/chithis/${row.id}`), envFor(fake));
  assert.equal((await one.json() as { content: string }).content, "চিঠি");
});

test("PATCH returns the updated row and DELETE removes it", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const created = await worker.fetch(json("/api/chithis", "POST", { content: "old" }), envFor(fake));
  const { id } = await created.json() as { id: string };
  const patched = await worker.fetch(json(`/api/chithis/${id}`, "PATCH", { content: "new" }), envFor(fake));
  assert.equal(patched.status, 200);
  assert.equal((await patched.json() as { content: string }).content, "new");
  const deleted = await worker.fetch(new Request(`${base}/api/chithis/${id}`, { method: "DELETE" }), envFor(fake));
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { success: true });
  const missing = await worker.fetch(new Request(`${base}/api/chithis/${id}`), envFor(fake));
  assert.equal(missing.status, 404);
});

test("validation and unknown paths return JSON errors without hitting the proxy", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const bad = await worker.fetch(json("/api/chithis", "POST", { content: " " }), envFor(fake));
  assert.equal(bad.status, 400);
  assert.equal(typeof (await bad.json() as { error: string }).error, "string");
  const unknown = await worker.fetch(new Request(`${base}/api/chithis/nope/extra`), envFor(fake));
  assert.equal(unknown.status, 404);
  assert.equal(typeof (await unknown.json() as { error: string }).error, "string");
});

test("client-supplied generatedFor and source are ignored; CORS headers are present", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const hour = 1_760_000_000_000 - (1_760_000_000_000 % 3_600_000);
  const response = await worker.fetch(json("/api/chithis", "POST", {
    content: "test", source: "ai", generatedFor: hour, paperStyle: "other",
  }), envFor(fake));
  assert.equal(response.status, 201);
  const row = await response.json() as { source: string; generated_for: number | null; paper_style: string };
  assert.equal(row.source, "manual");
  assert.equal(row.generated_for, null);
  assert.equal(row.paper_style, "classic");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  const preflight = await worker.fetch(new Request(`${base}/api/chithis`, { method: "OPTIONS" }), envFor(fake));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods") ?? "", /PATCH/);
});
