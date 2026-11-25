/**
 * Raw shapes for the `sync/get/free4talk/groups` payload and the aggregated,
 * D1-compatible rows produced from them.
 */

/** A participant as received from the free4talk groups response. */
export interface RawClient {
  id: string;
  name: string;
  avatar?: string | null;
  followers?: number | null;
  following?: number | null;
  friends?: number | null;
  supporter?: number | null;
  bio?: string | null;
}

/** A room as received from the free4talk groups response. */
export interface RawRoom {
  id: string;
  topic?: string | null;
  language: string;
  secondLanguage?: string | null;
  level?: string | null;
  maxPeople?: number | null;
  clients?: RawClient[] | null;
  settings?: {
    isLocked?: boolean | number | null;
    noMic?: boolean | number | null;
    [key: string]: unknown;
  } | null;
  roomUrl?: string | null;
  owner: {
    id: string;
    name: string;
    verified?: boolean | number | null;
    avatar?: string | null;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AggregatedSnapshot {
  scrapedAt: string;
  totalRooms: number;
  totalParticipants: number;
  rooms: AggregatedRoom[];
  participants: AggregatedParticipant[];
}

export interface AggregatedRoom {
  roomId: string;
  topic: string;
  language: string;
  secondLanguage: string | null;
  level: string | null;
  maxPeople: number | null;
  currentPeople: number;
  isLocked: number;
  noMic: number;
  roomUrl: string | null;
  ownerId: string;
  ownerName: string;
  ownerVerified: number;
  ownerAvatar: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AggregatedParticipant {
  roomId: string;
  userId: string;
  name: string;
  avatar: string | null;
  followers: number | null;
  following: number | null;
  friends: number | null;
  supporter: number | null;
  bio: string | null;
}
