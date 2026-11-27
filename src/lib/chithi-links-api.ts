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

export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type HourlyRunResult = {
  chithi: StepResult<string | null>;
  scrape: StepResult<{
    snapshotId: number;
    totalRooms: number;
    totalParticipants: number;
  }>;
  links: StepResult<{
    discovered: number;
    verified: number;
    rejected: number;
    sent: number;
    failed: number;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
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

export function triggerHourlyRun(token: string): Promise<HourlyRunResult> {
  return request<HourlyRunResult>("/api/chithi-links/run", {
    method: "POST",
    headers: { "X-Run-Token": token },
  });
}
