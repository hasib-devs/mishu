import { launch } from "@cloudflare/playwright";
import { aggregateSnapshot } from "./aggregate.ts";
import { extractRooms, toRawRoom } from "./parse.ts";
import type { RawRoom } from "./types.ts";
import { insertSnapshot } from "./db.ts";

export async function scrapeFree4Talk(
  env: Env,
): Promise<{ snapshotId: number; totalRooms: number; totalParticipants: number }> {
  const browser = await launch(env.MYBROWSER, { keep_alive: 120000 });
  const rooms = new Map<string, RawRoom>();

  try {
    const page = await browser.newPage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on("response", async (response: any) => {
      try {
        if (!response.url().includes("sync/get/free4talk/groups")) return;
        const payload = await response.json();
        for (const raw of extractRooms(payload)) {
          const room = toRawRoom(raw);
          if (room) rooms.set(room.id, room);
        }
      } catch {
        // ignore non-JSON / failed responses
      }
    });

    await page.goto("https://www.free4talk.com", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(8000);
    for (let i = 0; i < 3; i++) {
      await page.evaluate("window.scrollBy(0, window.innerHeight)");
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(5000);
  } finally {
    await browser.close();
  }

  if (rooms.size === 0) {
    throw new Error("scrapeFree4Talk: no rooms collected");
  }

  const roomList = Array.from(rooms.values());
  const agg = aggregateSnapshot(roomList, new Date().toISOString());
  const snapshotId = await insertSnapshot(env.DB, agg);
  return {
    snapshotId,
    totalRooms: agg.totalRooms,
    totalParticipants: agg.totalParticipants,
  };
}
