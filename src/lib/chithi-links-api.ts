export type ChithiTarget = {
  username: string;
  profileId: string | null;
  source: string;
  firstSeenAt: number;
  lastSeenAt: number;
  verifiedAt: number | null;
  active: number;
  lastSentAt: number | null;
  lastQuote: string | null;
  sendCount: number;
  lastError: string | null;
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return (await response.json()) as T;
}

export function fetchChithiTargets(limit = 100): Promise<ChithiTarget[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<ChithiTarget[]>(`/api/chithi-links?${params.toString()}`);
}
