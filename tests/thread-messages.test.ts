import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "../src/lib/chat-transport.ts";
import { toChatMessages, toStoredMessages } from "../src/lib/thread-messages.ts";

test("reasoning and tool parts survive a store/restore round-trip", () => {
  const original = {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "thinking" },
      { type: "text", text: "Here " },
      { type: "text", text: "you go" },
      {
        type: "tool-runCommand",
        state: "output-available",
        input: { command: "ls" },
        output: { stdout: "ok" },
      },
    ],
  } as ChatMessage;

  const restored = toChatMessages(toStoredMessages([original]))[0];

  assert.equal(restored.id, "a1");
  assert.deepEqual(restored.parts, original.parts);
});

test("legacy rows with no parts become one text part", () => {
  const restored = toChatMessages([
    { id: "m1", role: "user", content: "Legacy text", parts: null },
  ]);

  assert.deepEqual(restored[0].parts, [{ type: "text", text: "Legacy text" }]);
});

test("stored content concatenates all text parts", () => {
  const message = {
    id: "a2",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "hidden" },
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ],
  } as ChatMessage;

  assert.equal(toStoredMessages([message])[0].content, "Hello world");
});
