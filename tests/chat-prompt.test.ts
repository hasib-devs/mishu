import assert from "node:assert/strict";
import test from "node:test";

import { MAX_OUTPUT_TOKENS, SYSTEM_PROMPT } from "../worker/chat-prompt.ts";

test("the system prompt asks for complete, accurate, structured answers", () => {
  assert.equal(MAX_OUTPUT_TOKENS, 8192);
  assert.match(SYSTEM_PROMPT, /accurate/i);
  assert.match(SYSTEM_PROMPT, /uncertain/i);
  assert.match(SYSTEM_PROMPT, /tables/i);
  assert.doesNotMatch(SYSTEM_PROMPT, /small and concise/i);
});
