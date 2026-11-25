import assert from "node:assert/strict";
import test from "node:test";

import { createLoadToken } from "../src/lib/thread-load-token.ts";

test("a superseded thread load is ignored", () => {
  const token = createLoadToken();
  const older = token.next();
  const newer = token.next();

  assert.equal(token.isCurrent(older), false);
  assert.equal(token.isCurrent(newer), true);
});

test("each load gets a distinct token", () => {
  const token = createLoadToken();

  assert.notEqual(token.next(), token.next());
});
