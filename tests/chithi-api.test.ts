import assert from "node:assert/strict";
import test from "node:test";
import { createChithi, listChithis, updateChithi } from "../src/lib/chithi-api.ts";

test("client sends the right paths, JSON bodies and errors on non-2xx", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "c1", content: "হ্যাঁ" }), { status: 201 });
  }) as typeof fetch;
  try {
    await createChithi("হ্যাঁ");
    await listChithis(25);
    await updateChithi("c1", "নতুন");
    assert.deepEqual(calls.map((c) => c.url), ["/api/chithis", "/api/chithis?limit=25", "/api/chithis/c1"]);
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { content: "হ্যাঁ" });
    assert.equal(calls[2].init?.method, "PATCH");
  } finally {
    globalThis.fetch = original;
  }
});

test("client sends style and slot options and accepts a patch object", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "c1" }), { status: 201 });
  }) as typeof fetch;
  const hour = 1_760_000_000_000 - (1_760_000_000_000 % 3_600_000);
  try {
    await createChithi("hi", { paperStyle: "minimal", generatedFor: hour });
    await updateChithi("c1", { content: "new", paperStyle: "modern" });
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      content: "hi", paper_style: "minimal", generated_for: hour,
    });
    assert.equal(calls[1].init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
      content: "new", paper_style: "modern",
    });
  } finally {
    globalThis.fetch = original;
  }
});
