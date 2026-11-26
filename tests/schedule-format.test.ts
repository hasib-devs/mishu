import assert from "node:assert/strict";
import test from "node:test";

import { formatCountdown, remainingMs } from "../src/lib/schedule-format.ts";

test("formats hh:mm:ss with zero padding", () => {
  assert.equal(formatCountdown(3_723_000), "01:02:03");
  assert.equal(formatCountdown(42_017), "00:00:42");
});

test("clamps passed runs to zero", () => {
  assert.equal(formatCountdown(-5_000), "00:00:00");
});

test("a fast client clock still gets the server-anchored remaining time", () => {
  // serverNow=1_000, client received at 301_000 (5 min fast), next run one server-hour later
  assert.equal(remainingMs(3_601_000, 1_000, 301_000, 301_500), 3_599_500);
});
