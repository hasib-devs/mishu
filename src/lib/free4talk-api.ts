export type F4tSnapshot = {
  id: number; scrapedAt: string; totalRooms: number; totalParticipants: number;
};
export type F4tRoom = {
  roomId: string; topic: string; language: string; secondLanguage: string | null;
  level: string | null; maxPeople: number | null; currentPeople: number;
  isLocked: number; noMic: number; roomUrl: string | null;
  ownerId: string; ownerName: string; ownerVerified: number;
  ownerAvatar: string | null; createdAt: string | null; updatedAt: string | null;
};
export type F4tDailyStat = {
  day: string; language: string; avgRooms: number; peakRooms: number;
  peakParticipants: number; peakHour: number | null; uniqueOwners: number;
};
export type F4tOwner = {
  ownerId: string; ownerName: string; rooms: number; participants: number;
};
export type F4tUser = {
  userId: string; name: string; followers: number; friends: number; rooms: number;
};
export type F4tLatest = { snapshot: F4tSnapshot; rooms: F4tRoom[] } | null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${detail}`.trim());
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchLatest(): Promise<F4tLatest> {
  return request<F4tLatest>("/api/free4talk/latest");
}

export function fetchSnapshots(limit = 24): Promise<F4tSnapshot[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return request<F4tSnapshot[]>(`/api/free4talk/snapshots?${params.toString()}`);
}

export function fetchLanguages(days = 7): Promise<F4tDailyStat[]> {
  const params = new URLSearchParams();
  params.set("days", String(days));
  return request<F4tDailyStat[]>(`/api/free4talk/languages?${params.toString()}`);
}

export function fetchTopOwners(limit = 20): Promise<F4tOwner[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return request<F4tOwner[]>(`/api/free4talk/top-owners?${params.toString()}`);
}

export function fetchTopUsers(limit = 20): Promise<F4tUser[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return request<F4tUser[]>(`/api/free4talk/top-users?${params.toString()}`);
}

export function fetchRooms(filters?: { language?: string; level?: string; q?: string }): Promise<F4tRoom[]> {
  const params = new URLSearchParams();
  if (filters?.language) params.set("language", filters.language);
  if (filters?.level) params.set("level", filters.level);
  if (filters?.q) params.set("q", filters.q);
  const qs = params.toString();
  const path = qs ? `/api/free4talk/rooms?${qs}` : "/api/free4talk/rooms";
  return request<F4tRoom[]>(path);
}