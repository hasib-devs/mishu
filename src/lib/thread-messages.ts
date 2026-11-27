import { messageContent, type ChatMessage } from "./chat-transport.ts";

export type StoredMessage = {
  id: string;
  role: string;
  content: string;
  parts: unknown[] | null;
  created_at?: number;
};

export type StoredMessageInput = {
  id: string;
  role: string;
  content: string;
  parts: unknown[];
};

const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);

function normalizeRole(role: string): "user" | "assistant" | "system" | "tool" {
  return VALID_ROLES.has(role) ? (role as "user" | "assistant" | "system" | "tool") : "assistant";
}

export function toChatMessages(rows: StoredMessage[]): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: normalizeRole(row.role),
    parts: Array.isArray(row.parts)
      ? structuredClone(row.parts)
      : [{ type: "text", text: row.content }],
  })) as ChatMessage[];
}

export function messagesToSave(messages: ChatMessage[], failed: boolean): ChatMessage[] {
  // A failed generation drops only the trailing assistant turn, not earlier
  // successful answers. The user's question is still part of the conversation
  // and must survive a refresh or retry.
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const candidates = failed ? messages.slice(0, lastUserIndex + 1) : messages;
  return candidates.filter((message) => message.role !== "assistant" || message.parts.length > 0);
}

export function toStoredMessages(messages: ChatMessage[]): StoredMessageInput[] {
  return messages.map((message) => ({
    id: message.id,
    role: normalizeRole(message.role),
    content: messageContent(message),
    parts: structuredClone(message.parts),
  }));
}
