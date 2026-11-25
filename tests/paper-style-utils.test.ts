import assert from "node:assert/strict";
import test from "node:test";
import { PAPER_CLASSES, paperClass } from "../src/components/chithi/paper-style-utils.ts";

test("paper classes cover every style with a classic fallback", () => {
  assert.equal(Object.keys(PAPER_CLASSES).length, 3);
  for (const style of ["classic", "modern", "minimal"] as const) {
    assert.ok(PAPER_CLASSES[style].length > 0);
  }
  assert.equal(new Set(Object.values(PAPER_CLASSES)).size, 3);
  assert.equal(paperClass("unknown"), PAPER_CLASSES.classic);
  assert.equal(paperClass("modern"), PAPER_CLASSES.modern);
});