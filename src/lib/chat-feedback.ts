/** Local-only thumbs up/down votes on assistant replies.
 *
 * Votes are keyed by thread and message so they survive a reload without a
 * backend. Storage is best-effort: a full or unavailable localStorage must
 * never break the chat.
 */
export type FeedbackVote = "up" | "down";

const STORAGE_KEY = "mishu:chat-feedback";

function readEntries(): Record<string, Record<string, unknown>> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, Record<string, unknown>>;
    }
  } catch {
    // malformed or unavailable storage behaves like no stored votes
  }
  return {};
}

function writeEntries(entries: Record<string, Record<string, unknown>>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage is a best-effort cache; it must never block the caller
  }
}

export function getFeedback(threadId: string, messageId: string): FeedbackVote | null {
  const vote = readEntries()[threadId]?.[messageId];
  return vote === "up" || vote === "down" ? vote : null;
}

export function setFeedback(threadId: string, messageId: string, vote: FeedbackVote | null): void {
  const entries = readEntries();
  const thread = entries[threadId] ?? {};

  if (vote === null) {
    delete thread[messageId];
  } else {
    thread[messageId] = vote;
  }

  if (Object.keys(thread).length === 0) {
    delete entries[threadId];
  } else {
    entries[threadId] = thread;
  }
  writeEntries(entries);
}
