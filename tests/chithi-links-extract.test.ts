import assert from "node:assert/strict";
import test from "node:test";

import { extractChithiUsernames } from "../worker/chithi-links/extract.ts";

test("extracts a full chithi.me URL from room topic text", () => {
  assert.deepEqual(
    extractChithiUsernames("Practice English — https://chithi.me/Aurth0 welcome"),
    ["Aurth0"],
  );
});

test("accepts scheme-less and www links", () => {
  assert.deepEqual(extractChithiUsernames("chithi.me/Aurth0"), ["Aurth0"]);
  assert.deepEqual(extractChithiUsernames("https://www.chithi.me/Aurth0"), ["Aurth0"]);
});

test("stops the username at query, fragment and path boundaries", () => {
  assert.deepEqual(extractChithiUsernames("https://chithi.me/Aurth0?ref=x"), ["Aurth0"]);
  assert.deepEqual(extractChithiUsernames("https://chithi.me/Aurth0#top"), ["Aurth0"]);
  assert.deepEqual(extractChithiUsernames("https://chithi.me/Aurth0/letter-sent"), ["Aurth0"]);
});

test("strips trailing punctuation from a username at end of a sentence", () => {
  assert.deepEqual(extractChithiUsernames("Message me at https://chithi.me/Aurth0."), ["Aurth0"]);
  assert.deepEqual(extractChithiUsernames("https://chithi.me/hello_"), ["hello"]);
});

test("rejects lookalike hosts", () => {
  assert.deepEqual(extractChithiUsernames("https://notchithi.me/Aurth0"), []);
  assert.deepEqual(extractChithiUsernames("https://chithi.me.evil.com/Aurth0"), []);
  assert.deepEqual(extractChithiUsernames("https://mychithi.me/Aurth0"), []);
});

test("dedupes case-insensitively and keeps the first-seen casing", () => {
  assert.deepEqual(
    extractChithiUsernames("https://chithi.me/Aurth0 and chithi.me/aurth0 and chithi.me/Bob"),
    ["Aurth0", "Bob"],
  );
});

test("returns an empty list for null, empty and unrelated text", () => {
  assert.deepEqual(extractChithiUsernames(null), []);
  assert.deepEqual(extractChithiUsernames(undefined), []);
  assert.deepEqual(extractChithiUsernames(""), []);
  assert.deepEqual(extractChithiUsernames("no links here"), []);
});
