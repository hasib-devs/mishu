import type { RawRoom } from "./types.ts";

interface RawEnvelope {
  rooms?: unknown;
  data?: { rooms?: unknown } | Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Extract room objects from the `sync/get/free4talk/groups` response.
 * The live API returns `{success, error, data: {<roomId>: room, ...}}`;
 * older forms (array, `{rooms}`, `{data:{rooms}}`) remain supported.
 */
export function extractRooms(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const envelope = payload as RawEnvelope;
    if (Array.isArray(envelope.rooms)) return envelope.rooms;
    if (envelope.data && typeof envelope.data === "object") {
      const data = envelope.data as { rooms?: unknown };
      if (Array.isArray(data.rooms)) return data.rooms;
      return Object.values(envelope.data);
    }
  }
  return [];
}

/** Map an intercepted room object onto the RawRoom shape, tolerating API variants. */
export function toRawRoom(raw: unknown): RawRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (r.id ?? r.roomId) as string | undefined;
  const language = (r.language ?? r.lang) as string | undefined;
  const owner = (r.owner ?? r.creator) as Record<string, unknown> | undefined;
  if (!id || !language || !owner) return null;
  const ownerId = owner.id ?? r.userId;
  if (!ownerId || !owner.name) return null;

  return {
    id,
    topic: (r.topic ?? null) as string | null,
    language,
    secondLanguage: (r.secondLanguage ?? r.second_language ?? null) as string | null,
    level: (r.level ?? null) as string | null,
    maxPeople: (r.maxPeople ?? r.max_people ?? null) as number | null,
    clients: (r.clients ?? r.participants ?? null) as RawRoom["clients"],
    settings: (r.settings ?? null) as RawRoom["settings"],
    roomUrl: (r.roomUrl ?? r.room_url ?? r.url ?? null) as string | null,
    owner: {
      id: String(ownerId),
      name: String(owner.name),
      verified: (owner.verified ?? owner.isVerified ?? null) as boolean | number | null,
      avatar: (owner.avatar ?? null) as string | null,
    },
    createdAt: (r.createdAt ?? r.created_at ?? null) as string | null,
    updatedAt: (r.updatedAt ?? r.updated_at ?? null) as string | null,
  };
}
