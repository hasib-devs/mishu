/**
 * D1 data access for chithi.me targets discovered in free4talk snapshots.
 * Raw, fully-parameterized SQL mirroring the f4t_* free4talk layer.
 */

export interface TargetRow {
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
}

interface TargetDbRow {
  username: string;
  profile_id: string | null;
  source: string;
  first_seen_at: number;
  last_seen_at: number;
  verified_at: number | null;
  active: number;
  last_sent_at: number | null;
  last_quote: string | null;
  send_count: number;
  last_error: string | null;
}

const COLUMNS =
  "username, profile_id, source, first_seen_at, last_seen_at, verified_at, " +
  "active, last_sent_at, last_quote, send_count, last_error";

function mapTarget(row: TargetDbRow): TargetRow {
  return {
    username: row.username,
    profileId: row.profile_id,
    source: row.source,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    verifiedAt: row.verified_at,
    active: row.active,
    lastSentAt: row.last_sent_at,
    lastQuote: row.last_quote,
    sendCount: row.send_count,
    lastError: row.last_error,
  };
}

/** Topics and bios from the most recent free4talk snapshot. */
export async function readLatestSnapshotTexts(
  db: D1Database,
): Promise<{ topics: string[]; bios: string[] }> {
  const latest = await db
    .prepare(
      "SELECT id FROM f4t_snapshots ORDER BY scraped_at DESC, id DESC LIMIT 1",
    )
    .first<{ id: number }>();
  if (!latest) return { topics: [], bios: [] };

  const [topicRows, bioRows] = await Promise.all([
    db
      .prepare("SELECT topic FROM f4t_rooms WHERE snapshot_id = ?")
      .bind(latest.id)
      .all<{ topic: string | null }>(),
    db
      .prepare("SELECT bio FROM f4t_participants WHERE snapshot_id = ?")
      .bind(latest.id)
      .all<{ bio: string | null }>(),
  ]);

  return {
    topics: topicRows.results
      .map((row) => row.topic)
      .filter((topic): topic is string => typeof topic === "string"),
    bios: bioRows.results
      .map((row) => row.bio)
      .filter((bio): bio is string => typeof bio === "string"),
  };
}

/**
 * Insert new targets and refresh `last_seen_at` for known ones. Usernames are
 * matched case-insensitively; the first-seen spelling and source are kept.
 * Returns the number of newly inserted rows.
 */
export async function upsertTargets(
  db: D1Database,
  items: { username: string; source: string }[],
  now: number,
): Promise<number> {
  if (items.length === 0) return 0;

  const known = new Set<string>(
    (
      await db
        .prepare("SELECT username FROM f4t_chithi_targets")
        .all<{ username: string }>()
    ).results.map((row) => row.username.toLowerCase()),
  );

  let inserted = 0;
  const statements: D1PreparedStatement[] = items.map((item) => {
    const key = item.username.toLowerCase();
    if (known.has(key)) {
      return db
        .prepare(
          "UPDATE f4t_chithi_targets SET last_seen_at = ? " +
            "WHERE LOWER(username) = ?",
        )
        .bind(now, key);
    }
    known.add(key);
    inserted += 1;
    return db
      .prepare(
        "INSERT INTO f4t_chithi_targets " +
          "(username, source, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .bind(item.username, item.source, now, now);
  });

  await db.batch(statements);
  return inserted;
}

/** All discovered targets, newest-seen first. */
export async function listTargets(
  db: D1Database,
  limit: number,
): Promise<TargetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM f4t_chithi_targets ` +
        "ORDER BY last_seen_at DESC, username DESC LIMIT ?",
    )
    .bind(limit)
    .all<TargetDbRow>();
  return results.map(mapTarget);
}

/** Active targets that have never received a quote. */
export async function listUnsentTargets(
  db: D1Database,
  limit: number,
): Promise<TargetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM f4t_chithi_targets ` +
        "WHERE active = 1 AND last_sent_at IS NULL " +
        "ORDER BY last_seen_at DESC, username DESC LIMIT ?",
    )
    .bind(limit)
    .all<TargetDbRow>();
  return results.map(mapTarget);
}

export async function markVerified(
  db: D1Database,
  username: string,
  profileId: string,
  now: number,
  active: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE f4t_chithi_targets SET profile_id = ?, verified_at = ?, active = ? " +
        "WHERE LOWER(username) = ?",
    )
    .bind(profileId, now, active, username.toLowerCase())
    .run();
}

export async function markUnverified(
  db: D1Database,
  username: string,
  now: number,
  error: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE f4t_chithi_targets SET active = 0, verified_at = ?, last_error = ? " +
        "WHERE LOWER(username) = ?",
    )
    .bind(now, error, username.toLowerCase())
    .run();
}

export async function markSent(
  db: D1Database,
  username: string,
  now: number,
  quote: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE f4t_chithi_targets SET last_sent_at = ?, last_quote = ?, " +
        "send_count = send_count + 1, last_error = NULL WHERE LOWER(username) = ?",
    )
    .bind(now, quote, username.toLowerCase())
    .run();
}

export async function markSendFailed(
  db: D1Database,
  username: string,
  _now: number,
  error: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE f4t_chithi_targets SET last_error = ? WHERE LOWER(username) = ?",
    )
    .bind(error, username.toLowerCase())
    .run();
}
