import { launch } from "@cloudflare/playwright";
import { aggregateSnapshot } from "./aggregate.ts";
import type { RawRoom } from "./types.ts";
import { insertSnapshot } from "./db.ts";

interface RawEnvelope {
  rooms?: unknown;
  data?: { rooms?: unknown };
  [key: string]: unknown;
}

/** Extract the room array from a tolerated envelope shape. */
function extractRooms(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const env = payload as RawEnvelope;
    if (Array.isArray(env.rooms)) return env.rooms;
    if (env.data && typeof env.data === "object" && Array.isArray(env.data.rooms)) {
      return env.data.rooms;
    }
  }
  return [];
}

/** Map an intercepted room object onto the RawRoom shape. Field names tolerate
 *  minor API variants (roomId/id, etc.) but otherwise pass through. */
function toRawRoom(raw: unknown): RawRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (r.id ?? r.roomId) as string | undefined;
  const language = r.language as string | undefined;
  const owner = r.owner as Record<string, unknown> | undefined;
  if (!id || !language || !owner || !owner.id || !owner.name) return null;

  return {
    id,
    topic: (r.topic ?? null) as string | null,
    language,
    secondLanguage: (r.secondLanguage ?? r.second_language ?? null) as string | null,
    level: (r.level ?? null) as string | null,
    maxPeople: (r.maxPeople ?? r.max_people ?? null) as number | null,
    clients: (r.clients ?? r.participants ?? null) as RawRoom["clients"],
    settings: (r.settings ?? null) as RawRoom["settings"],
    roomUrl: (r.roomUrl ?? r.room_url ?? null) as string | null,
    owner: {
      id: String(owner.id),
      name: String(owner.name),
      verified: (owner.verified ?? null) as boolean | number | null,
      avatar: (owner.avatar ?? null) as string | null,
    },
    createdAt: (r.createdAt ?? r.created_at ?? null) as string | null,
    updatedAt: (r.updatedAt ?? r.updated_at ?? null) as string | null,
  };
}

export async function scrapeFree4Talk(
  env: Env,
): Promise<{ snapshotId: number; totalRooms: number; totalParticipants: number }> {
  const browser = await launch(env.MYBROWSER, { keep_alive: 120000 });
  const rooms = new Map<string, RawRoom>();

  try {
    const page = await browser.newPage();
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