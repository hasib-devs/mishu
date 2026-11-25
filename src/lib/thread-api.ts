import type { StoredMessage } from "./thread-messages.ts";

export type { StoredMessage, StoredMessageInput } from "./thread-messages.ts";

export type ThreadSummary = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type ThreadDetail = ThreadSummary & {
  messages: StoredMessage[];
};

export type SaveMessage = {
  id: string;
  role: string;
  content: string;
  parts: unknown[];
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

export function listThreads(): Promise<ThreadSummary[]> {
  return request<ThreadSummary[]>("/api/threads");
}

export function createThread(title?: string): Promise<ThreadSummary> {
  return request<ThreadSummary>("/api/threads", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function getThread(id: string): Promise<ThreadDetail> {
  return request<ThreadDetail>(`/api/threads/${encodeURIComponent(id)}`);
}

export async function deleteThread(id: string): Promise<void> {
  await request<void>(`/api/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function saveMessages(id: string, messages: SaveMessage[]): Promise<void> {
  await request<{ success: true }>(`/api/threads/${encodeURIComponent(id)}/messages`, {
    method: "PUT",
    body: JSON.stringify({ messages }),
  });
}
