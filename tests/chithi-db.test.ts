import assert from "node:assert/strict";
import test from "node:test";
import { dbFor } from "../worker/chithi/db.ts";
import { chithis } from "../worker/chithi/schema.ts";
import { createFakeD1 } from "./support/fake-d1.ts";

test("drizzle round-trips a chithi row through D1", async () => {
  const fake = createFakeD1({ threads: [], messages: [], chithis: [] });
  const db = dbFor(fake.db);
  await db.insert(chithis).values({
    id: "c1", content: "চিঠি", source: "manual", generated_for: null,
    paper_style: "classic", created_at: 1000, updated_at: 1000,
  });
  const rows = await db.select().from(chithis);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content, "চিঠি");
  assert.equal(fake.state.chithis[0].id, "c1");
});
