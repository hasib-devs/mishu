import { extractChithiUsernames } from "./extract.ts";
import {
  listTargets,
  listUnsentTargets,
  markSendFailed,
  markSent,
  markUnverified,
  markVerified,
  readLatestSnapshotTexts,
  upsertTargets,
} from "./db.ts";
import { generateQuote } from "./quote.ts";
import type { SendResult } from "./sender.ts";
import { sendLetters } from "./sender.ts";
import type { ChithiProfile } from "./verify.ts";
import { verifyChithiProfile } from "./verify.ts";

export interface PipelineResult {
  discovered: number;
  verified: number;
  rejected: number;
  sent: number;
  failed: number;
}

export interface PipelineOptions {
  now?: number;
  maxSends?: number;
  readTexts?: (db: D1Database) => Promise<{ topics: string[]; bios: string[] }>;
  verify?: (username: string) => Promise<ChithiProfile | null>;
  generate?: () => Promise<string>;
  send?: (items: { username: string; content: string }[]) => Promise<SendResult[]>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Post-scrape pipeline: discover chithi.me links, verify profiles, generate one
 * fresh AI quote per target and send it through the browser. External calls are
 * injectable so the whole flow is unit-testable without network or a browser.
 */
export async function runChithiLinkPipeline(
  env: Env,
  db: D1Database,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const now = options.now ?? Date.now();
  const maxSends = options.maxSends ?? 25;
  const readTexts = options.readTexts ?? readLatestSnapshotTexts;
  const verify =
    options.verify ?? ((username: string) => verifyChithiProfile(username));
  const generate =
    options.generate ??
    (() => generateQuote(env as unknown as Record<string, unknown>));
  const send = options.send ?? ((items) => sendLetters(env, items));

  // Phase 1 — discover from the newest snapshot's topics and bios.
  const texts = await readTexts(db);
  const found: { username: string; source: string }[] = [];
  const seen = new Set<string>();
  const add = (username: string, source: string) => {
    const key = username.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ username, source });
  };
  for (const topic of texts.topics) {
    for (const username of extractChithiUsernames(topic)) add(username, "room_topic");
  }
  for (const bio of texts.bios) {
    for (const username of extractChithiUsernames(bio)) add(username, "user_bio");
  }
  const discovered = await upsertTargets(db, found, now);

  // Phase 2 — verify profiles not checked before.
  let verified = 0;
  let rejected = 0;
  for (const target of await listTargets(db, 1000)) {
    if (target.verifiedAt !== null) continue;
    const profile = await verify(target.username);
    if (profile) {
      await markVerified(db, target.username, profile.id, now, 1);
      verified += 1;
    } else {
      await markUnverified(db, target.username, now, "profile missing or paused");
      rejected += 1;
    }
  }

  // Phase 3 — a fresh AI quote per user, so no two letters share a source.
  let sent = 0;
  let failed = 0;
  const items: { username: string; content: string }[] = [];
  const quotes = new Map<string, string>();
  for (const target of await listUnsentTargets(db, maxSends)) {
    try {
      const quote = await generate();
      items.push({ username: target.username, content: quote });
      quotes.set(target.username, quote);
    } catch (err) {
      await markSendFailed(db, target.username, now, errorMessage(err));
      failed += 1;
    }
  }

  // Phase 4 — one browser session for the whole batch; failures stay local.
  if (items.length > 0) {
    for (const result of await send(items)) {
      if (result.ok) {
        await markSent(db, result.username, now, quotes.get(result.username) ?? "");
        sent += 1;
      } else {
        await markSendFailed(db, result.username, now, result.error ?? "send failed");
        failed += 1;
      }
    }
  }

  return { discovered, verified, rejected, sent, failed };
}
