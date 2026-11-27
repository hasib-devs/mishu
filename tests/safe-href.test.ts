import assert from "node:assert/strict";
import test from "node:test";

import { safeHref } from "../src/lib/safe-href.ts";

test("safeHref allows http, https and mailto URLs", () => {
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safeHref("  https://example.com/a  "), "https://example.com/a");
});

test("safeHref rejects hostile, protocol-relative and empty hrefs", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("//evil.example"), null);
  assert.equal(safeHref(""), null);
  assert.equal(safeHref(undefined), null);
});
