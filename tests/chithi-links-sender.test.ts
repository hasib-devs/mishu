import assert from "node:assert/strict";
import test from "node:test";

import {
  sendLetters,
  type BrowserLike,
  type Launch,
  type PageLike,
} from "../worker/chithi-links/sender.ts";

interface FakeState {
  closed: number;
  visited: string[];
  filled: { username: string; content: string }[];
  clicks: number;
}

function fakeLaunch(failOn?: string): { launch: Launch; state: FakeState } {
  const state: FakeState = { closed: 0, visited: [], filled: [], clicks: 0 };

  const launch: Launch = async () => {
    let currentUser = "";
    const page: PageLike = {
      async goto(url: string) {
        currentUser = url.split("/").pop() ?? "";
        state.visited.push(url);
      },
      locator() {
        return {
          async fill(value: string) {
            if (currentUser === failOn) throw new Error("page broken");
            state.filled.push({ username: currentUser, content: value });
          },
        };
      },
      getByRole() {
        return {
          async click() {
            state.clicks += 1;
          },
        };
      },
      async waitForURL() {},
    };
    const browser: BrowserLike = {
      async newPage() {
        return page;
      },
      async close() {
        state.closed += 1;
      },
    };
    return browser;
  };

  return { launch, state };
}

test("sends a letter to each user and closes the browser once", async () => {
  const { launch, state } = fakeLaunch();
  const results = await sendLetters(
    {} as Env,
    [
      { username: "A", content: "quote A" },
      { username: "B", content: "quote B" },
    ],
    launch,
  );

  assert.deepEqual(results, [
    { username: "A", ok: true },
    { username: "B", ok: true },
  ]);
  assert.deepEqual(state.visited, ["https://chithi.me/A", "https://chithi.me/B"]);
  assert.deepEqual(state.filled, [
    { username: "A", content: "quote A" },
    { username: "B", content: "quote B" },
  ]);
  assert.equal(state.clicks, 2);
  assert.equal(state.closed, 1);
});

test("one failing user does not stop the others", async () => {
  const { launch, state } = fakeLaunch("B");
  const results = await sendLetters(
    {} as Env,
    [
      { username: "A", content: "quote A" },
      { username: "B", content: "quote B" },
      { username: "C", content: "quote C" },
    ],
    launch,
  );

  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
  assert.equal(state.closed, 1);
});
