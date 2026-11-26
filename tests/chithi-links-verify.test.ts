import assert from "node:assert/strict";
import test from "node:test";

import { verifyChithiProfile } from "../worker/chithi-links/verify.ts";

function fetchReturning(
  body: unknown,
  status = 200,
  seen: string[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

test("returns the profile for an active user and calls the profile endpoint", async () => {
  const seen: string[] = [];
  const profile = await verifyChithiProfile(
    "Aurth0",
    fetchReturning({ id: "uid-1", username: "Aurth0", paused: false }, 200, seen),
  );
  assert.deepEqual(profile, { id: "uid-1", username: "Aurth0", paused: false });
  assert.deepEqual(seen, ["https://chithi.me/api/profile/Aurth0"]);
});

test("rejects a paused profile", async () => {
  const profile = await verifyChithiProfile(
    "Aurth0",
    fetchReturning({ id: "uid-1", username: "Aurth0", paused: true }),
  );
  assert.equal(profile, null);
});

test("rejects a missing profile", async () => {
  const profile = await verifyChithiProfile(
    "Nobody",
    fetchReturning({ error: "Not Found" }, 404),
  );
  assert.equal(profile, null);
});

test("rejects malformed profiles", async () => {
  const withoutId = await verifyChithiProfile(
    "Aurth0",
    fetchReturning({ username: "Aurth0" }),
  );
  assert.equal(withoutId, null);

  const wrongUser = await verifyChithiProfile(
    "Aurth0",
    fetchReturning({ id: "uid-1", username: "SomeoneElse" }),
  );
  assert.equal(wrongUser, null);
});

test("rejects a non-JSON response", async () => {
  const brokenFetch = (async () => new Response("not json")) as typeof fetch;
  assert.equal(await verifyChithiProfile("Aurth0", brokenFetch), null);
});
