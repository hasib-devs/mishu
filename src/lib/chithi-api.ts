export type Chithi = {
  id: string;
  content: string;
  source: "manual" | "ai";
  generated_for: number | null;
  paper_style: string;
  created_at: number;
  updated_at: number;
};

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

export function listChithis(limit = 50): Promise<Chithi[]> {
  return request<Chithi[]>(`/api/chithis?limit=${limit}`);
}

export function createChithi(content: string): Promise<Chithi> {
  return request<Chithi>("/api/chithis", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function getChithi(id: string): Promise<Chithi> {
  return request<Chithi>(`/api/chithis/${encodeURIComponent(id)}`);
}

export async function updateChithi(id: string, content: string): Promise<Chithi> {
  return request<Chithi>(`/api/chithis/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteChithi(id: string): Promise<void> {
  await request<void>(`/api/chithis/${encodeURIComponent(id)}`, { method: "DELETE" });
}
