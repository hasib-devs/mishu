import type { ThreadSummary } from "./thread-api.ts";

export type ThreadGroup = {
  label: "Today" | "Yesterday" | "Earlier";
  threads: ThreadSummary[];
};

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function groupThreads(threads: ThreadSummary[], now = Date.now()): ThreadGroup[] {
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const buckets: Record<ThreadGroup["label"], ThreadSummary[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  for (const thread of threads) {
    const updated = startOfDay(thread.updated_at);
    if (updated === today) buckets.Today.push(thread);
    else if (updated === yesterday) buckets.Yesterday.push(thread);
    else buckets.Earlier.push(thread);
  }

  return (["Today", "Yesterday", "Earlier"] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, threads: buckets[label] }));
}
