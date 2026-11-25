import assert from "node:assert/strict";
import test from "node:test";
import { createFakeD1 } from "./support/fake-d1.ts";
import { dbFor } from "../worker/chithi/db.ts";
import { createChithi, deleteChithi, getChithi, listChithis, SlotTakenError, updateChithi } from "../worker/chithi/service.ts";
import { createChithiSchema, patchChithiSchema } from "../worker/chithi/validation.ts";

const db = () => dbFor(createFakeD1({ threads: [], messages: [], chithis: [] }).db);
const bengali = (n: number) => "চ".repeat(n);

test("create defaults to manual, classic and null slot, and lists newest first", async () => {
  const d = db();
  const first = await createChithi(d, { content: "প্রথম চিঠি" });
  const second = await createChithi(d, { content: "দ্বিতীয় চিঠি" });
  assert.equal(first.source, "manual");
  assert.equal(first.paper_style, "classic");
  assert.equal(first.generated_for, null);
  assert.deepEqual((await listChithis(d, 10)).map((r) => r.id), [second.id, first.id]);
});

test("validation accepts 600 Bengali characters and rejects 601, empty and whitespace-only", () => {
  assert.equal(createChithiSchema.safeParse({ content: bengali(600) }).success, true);
  assert.equal(createChithiSchema.safeParse({ content: bengali(601) }).success, false);
  assert.equal(createChithiSchema.safeParse({ content: "" }).success, false);
  assert.equal(createChithiSchema.safeParse({ content: "   " }).success, false);
  assert.equal(patchChithiSchema.safeParse({ content: "   " }).success, false);
});

test("update changes content and updated_at; delete removes the row", async () => {
  const d = db();
  const row = await createChithi(d, { content: "আগে" });
  const updated = await updateChithi(d, row.id, { content: "পরে" });
  assert.equal(updated?.content, "পরে");
  assert.ok(updated!.updated_at >= row.updated_at);
  assert.deepEqual(await getChithi(d, row.id), updated);
  assert.equal(await deleteChithi(d, row.id), true);
  assert.equal(await getChithi(d, row.id), null);
  assert.equal(await deleteChithi(d, row.id), false);
});

test("service rejects over-long and blank content before it reaches D1", async () => {
  const d = db();
  await assert.rejects(() => createChithi(d, { content: bengali(601) }));
  await assert.rejects(() => createChithi(d, { content: "   " }));
  const row = await createChithi(d, { content: "valid" });
  await assert.rejects(() => updateChithi(d, row.id, { content: bengali(601) }));
  assert.equal((await getChithi(d, row.id))?.content, "valid");
  assert.equal((await listChithis(d, 10)).length, 1);
});

test("duplicate hour-aligned generatedFor throws SlotTakenError", async () => {
  const d = db();
  const hour = 1_760_000_000_000 - (1_760_000_000_000 % 3_600_000);
  await createChithi(d, { content: "prv", source: "ai", generatedFor: hour });
  await assert.rejects(() => createChithi(d, { content: "next", source: "ai", generatedFor: hour }), SlotTakenError);
});

test("created_at is strictly increasing so newest-first ordering is deterministic", async () => {
  const d = db();
  const rows = [];
  for (let i = 0; i < 3; i += 1) rows.push(await createChithi(d, { content: `letter ${i}` }));
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      rows[i].created_at > rows[i - 1].created_at,
      `row ${i} must have a later created_at than row ${i - 1}`,
    );
  }
  assert.deepEqual(
    (await listChithis(d, 10)).map((r) => r.id),
    [rows[2].id, rows[1].id, rows[0].id],
  );
});

test("update never moves updated_at backwards after same-millisecond creates", async () => {
  const d = db();
  const rows = [];
  for (let i = 0; i < 3; i += 1) rows.push(await createChithi(d, { content: `letter ${i}` }));
  const newest = rows[2];
  const updated = await updateChithi(d, newest.id, { content: "edited" });
  assert.ok(updated!.updated_at > newest.updated_at);
});
