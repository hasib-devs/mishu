import type {
  AggregatedParticipant,
  AggregatedRoom,
  AggregatedSnapshot,
  RawRoom,
} from "./types.ts";

/** Map a truthy API flag (boolean or 0/1 number) to a D1 0/1 integer. */
function bit(value: boolean | number | null | undefined): number {
  return value === true || value === 1 ? 1 : 0;
}

/** Aggregate raw free4talk rooms into D1-compatible snapshot rows. */
export function aggregateSnapshot(
  rooms: RawRoom[],
  scrapedAt: string,
): AggregatedSnapshot {
  const aggregatedRooms: AggregatedRoom[] = [];
  const participants: AggregatedParticipant[] = [];
  const seen = new Set<string>();

  for (const room of rooms) {
    const clients = room.clients ?? [];

    aggregatedRooms.push({
      roomId: room.id,
      topic: room.topic ?? "",
      language: room.language,
      secondLanguage:
        room.secondLanguage == null || room.secondLanguage === ""
          ? null
          : room.secondLanguage,
      level: room.level ?? null,
      maxPeople: room.maxPeople ?? null,
      currentPeople: clients.length,
      isLocked: bit(room.settings?.isLocked),
      noMic: bit(room.settings?.noMic),
      roomUrl: room.roomUrl ?? null,
      ownerId: room.owner.id,
      ownerName: room.owner.name,
      ownerVerified: bit(room.owner.verified),
      ownerAvatar: room.owner.avatar ?? null,
      createdAt: room.createdAt ?? null,
      updatedAt: room.updatedAt ?? null,
    });

    for (const client of clients) {
      const key = `${room.id}\u0000${client.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      participants.push({
        roomId: room.id,
        userId: client.id,
        name: client.name,
        avatar: client.avatar ?? null,
        followers: client.followers ?? null,
        following: client.following ?? null,
        friends: client.friends ?? null,
        supporter: client.supporter ?? null,
        bio: client.bio ?? null,
      });
    }
  }

  return {
    scrapedAt,
    totalRooms: rooms.length,
    totalParticipants: participants.length,
    rooms: aggregatedRooms,
    participants,
  };
}
