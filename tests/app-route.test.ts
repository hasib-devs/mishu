import assert from "node:assert/strict";
import test from "node:test";
import { isChithiPath, withSearch } from "../src/lib/app-route.ts";

test("only the exact /chithi path opens the dashboard", () => {
  assert.equal(isChithiPath("/chithi"), true);
  assert.equal(isChithiPath("/"), false);
  assert.equal(isChithiPath("/chithi/extra"), false);
  assert.equal(isChithiPath("/chat?thread=t1"), false);
});

test("navigation preserves the active thread query string", () => {
  assert.equal(withSearch("/chithi", "?thread=t1"), "/chithi?thread=t1");
  assert.equal(withSearch("/", "?thread=t1"), "/?thread=t1");
  assert.equal(withSearch("/chithi", ""), "/chithi");
});
