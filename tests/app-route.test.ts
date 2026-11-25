import assert from "node:assert/strict";
import test from "node:test";
import { isChithiPath } from "../src/lib/app-route.ts";

test("only the exact /chithi path opens the dashboard", () => {
  assert.equal(isChithiPath("/chithi"), true);
  assert.equal(isChithiPath("/"), false);
  assert.equal(isChithiPath("/chithi/extra"), false);
  assert.equal(isChithiPath("/chat?thread=t1"), false);
});
