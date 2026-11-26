// `AggregatedSnapshot` is declared in types.ts (aggregate.ts only imports it
// and does not re-export it), so import from the defining module.
import type { AggregatedSnapshot } from "./types.ts";

/**
 * D1 data-access layer for free4talk snapshots. Uses raw, fully-parameterized
 * SQL against the f4t_* tables (see migrations/0004_free4talk.sql) and maps
 * snake_case columns to the camelCase shapes consumed by routes/cron.
 */

/** A snapshot summary without its rooms. */
export interface SnapshotSummary {
  id: number;
  scrapedAt: string;
  totalRooms: number;
  totalParticipants: number;
}

/** A room from a snapshot. */
export interface RoomRow {
  roomId: string;
  topic: string;
  language: string;
  secondLanguage: string | null;
  level: string | null;
  maxPeople: number | null;
  currentPeople: number;
  isLocked: number;
  noMic: number;
  roomUrl: string | null;
  ownerId: string;
  ownerName: string;
  ownerVerified: number;
  ownerAvatar: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A participant from a snapshot. (Exposed for consumers of this layer.) */
export interface ParticipantRow {
  roomId: string;
  userId: string;
  name: string;
  avatar: string | null;
  followers: number | null;
  following: number | null;
  friends: number | null;
  supporter: number | null;
  bio: string | null;
}

/** The latest snapshot together with its rooms. */
export interface LatestSnapshot {
  snapshot: SnapshotSummary;
  rooms: RoomRow[];
}

/** Optional filters for rooms of the latest snapshot. */
export interface RoomFilters {
  language?: string;
  level?: string;
  q?: string;
}

/** A room-owning account summarized over the latest snapshot. */
export interface OwnerStat {
  ownerId: string;
  ownerName: string;
  rooms: number;
  participants: number;
}

/** A user summarized over the latest snapshot's participants. */
export interface UserStat {
  userId: string;
  name: string;
  followers: number;
  friends: number;
  rooms: number;
}

/** One (day, language) row of the daily rollup. */
export interface DailyStat {
  day: string;
  language: string;
  avgRooms: number;
  peakRooms: number;
  peakParticipants: number;
  peakHour: number | null;
  uniqueOwners: number;
}

/** --- Internal snake_case row shapes returned by D1 --- */

interface SnapshotDbRow {
  id: number;
  scraped_at: string;
  total_rooms: number;
  total_participants: number;
}

interface RoomDbRow {
  room_id: string;
  topic: string | null;
  language: string;
  second_language: string | null;
  level: string | null;
  max_people: number | null;
  current_people: number;
  is_locked: number;
  no_mic: number;
  room_url: string | null;
  owner_id: string;
  owner_name: string;
  owner_verified: number;
  owner_avatar: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface OwnerStatDbRow {
  owner_id: string;
  owner_name: string;
  rooms: number;
  participants: number;
}

interface UserStatDbRow {
  user_id: string;
  name: string;
  followers: number;
  friends: number;
  rooms: number;
}

interface DailyStatDbRow {
  day: string;
  language: string;
  avg_rooms: number;
  peak_rooms: number;
  peak_participants: number;
  peak_hour: number | null;
  unique_owners: number;
}

interface RollupDbRow {
  language: string;
  avg_rooms: number;
  peak_rooms: number;
  peak_participants: number;
  peak_hour: number | null;
  unique_owners: number;
}

/** Static column lists (no user data) shared between queries. */
const SNAPSHOT_COLUMNS = "id, scraped_at, total_rooms, total_participants";
const ROOM_COLUMNS =
  "room_id, topic, language, second_language, level, max_people, " +
  "current_people, is_locked, no_mic, room_url, owner_id, owner_name, " +
  "owner_verified, owner_avatar, created_at, updated_at";
const LATEST_ORDER = "ORDER BY scraped_at DESC, id DESC";

function mapSnapshot(row: SnapshotDbRow): SnapshotSummary {
  return {
    id: row.id,
    scrapedAt: row.scraped_at,
    totalRooms: row.total_rooms,
    totalParticipants: row.total_participants,
  };
}

function mapRoom(row: RoomDbRow): RoomRow {
  return {
    roomId: row.room_id,
    topic: row.topic ?? "",
    language: row.language,
    secondLanguage: row.second_language,
    level: row.level,
    maxPeople: row.max_people,
    currentPeople: row.current_people,
    isLocked: row.is_locked,
    noMic: row.no_mic,
    roomUrl: row.room_url,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerVerified: row.owner_verified,
    ownerAvatar: row.owner_avatar,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Escape LIKE wildcards (and the escape char itself) in user input. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Insert a snapshot, its rooms and its participants in one atomic batch.
 * Returns the new snapshot id. */
export async function insertSnapshot(
  db: D1Database,
  agg: AggregatedSnapshot,
): Promise<number> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO f4t_snapshots (scraped_at, total_rooms, total_participants) VALUES (?, ?, ?)",
      )
      .bind(agg.scrapedAt, agg.totalRooms, agg.totalParticipants),
  ];

  // Reference the just-inserted snapshot by its unique scraped_at so the whole
  // set stays in one batch (no interleaved read of last_row_id).
  for (const room of agg.rooms) {
    statements.push(
      db
        .prepare(
          "INSERT INTO f4t_rooms (" +
            "snapshot_id, room_id, topic, language, second_language, level, " +
            "max_people, current_people, is_locked, no_mic, room_url, owner_id, " +
            "owner_name, owner_verified, owner_avatar, created_at, updated_at" +
            ") VALUES ((SELECT id FROM f4t_snapshots WHERE scraped_at = ?), " +
            "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          agg.scrapedAt,
          room.roomId,
          room.topic,
          room.language,
          room.secondLanguage,
          room.level,
          room.maxPeople,
          room.currentPeople,
          room.isLocked,
          room.noMic,
          room.roomUrl,
          room.ownerId,
          room.ownerName,
          room.ownerVerified,
          room.ownerAvatar,
          room.createdAt,
          room.updatedAt,
        ),
    );
  }

  for (const participant of agg.participants) {
    statements.push(
      db
        .prepare(
          "INSERT INTO f4t_participants (" +
            "snapshot_id, room_id, user_id, name, avatar, followers, following, " +
            "friends, supporter, bio" +
            ") VALUES ((SELECT id FROM f4t_snapshots WHERE scraped_at = ?), " +
            "?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          agg.scrapedAt,
          participant.roomId,
          participant.userId,
          participant.name,
          participant.avatar,
          participant.followers,
          participant.following,
          participant.friends,
          participant.supporter,
          participant.bio,
        ),
    );
  }

  const results = await db.batch(statements);
  return results[0].meta.last_row_id;
}

/** The latest snapshot plus its rooms, or null when there are no snapshots. */
export async function getLatest(
  db: D1Database,
): Promise<LatestSnapshot | null> {
  const row = await db
    .prepare(
      `SELECT ${SNAPSHOT_COLUMNS} FROM f4t_snapshots ${LATEST_ORDER} LIMIT 1`,
    )
    .first<SnapshotDbRow>();
  if (!row) return null;

  const { results } = await db
    .prepare(
      `SELECT ${ROOM_COLUMNS} FROM f4t_rooms WHERE snapshot_id = ?`,
    )
    .bind(row.id)
    .all<RoomDbRow>();

  return { snapshot: mapSnapshot(row), rooms: results.map(mapRoom) };
}

/** Recent snapshot summaries, newest first. */
export async function listSnapshots(
  db: D1Database,
  limit: number,
): Promise<SnapshotSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SNAPSHOT_COLUMNS} FROM f4t_snapshots ${LATEST_ORDER} LIMIT ?`,
    )
    .bind(limit)
    .all<SnapshotDbRow>();
  return results.map(mapSnapshot);
}

/** Rooms of the latest snapshot, with optional filters. [] when none. */
export async function listRoomsLatest(
  db: D1Database,
  filters: RoomFilters,
): Promise<RoomRow[]> {
  const latest = await db
    .prepare("SELECT id FROM f4t_snapshots " + LATEST_ORDER + " LIMIT 1")
    .first<{ id: number }>();
  if (!latest) return [];

  let sql = `SELECT ${ROOM_COLUMNS} FROM f4t_rooms WHERE snapshot_id = ?`;
  const binds: unknown[] = [latest.id];

  if (filters.language !== undefined) {
    sql += " AND language = ?";
    binds.push(filters.language);
  }
  if (filters.level !== undefined) {
    sql += " AND level = ?";
    binds.push(filters.level);
  }
  if (filters.q !== undefined && filters.q !== "") {
    const pattern = `%${escapeLike(filters.q)}%`;
    sql += " AND (topic LIKE ? ESCAPE '\\' OR owner_name LIKE ? ESCAPE '\\')";
    binds.push(pattern, pattern);
  }

  const { results } = await db.prepare(sql).bind(...binds).all<RoomDbRow>();
  return results.map(mapRoom);
}

/** Accounts owning the most rooms in the latest snapshot. */
export async function topOwnersLatest(
  db: D1Database,
  limit: number,
): Promise<OwnerStat[]> {
  const latest = await db
    .prepare("SELECT id FROM f4t_snapshots " + LATEST_ORDER + " LIMIT 1")
    .first<{ id: number }>();
  if (!latest) return [];

  const { results } = await db
    .prepare(
      "SELECT owner_id, MAX(owner_name) AS owner_name, COUNT(*) AS rooms, " +
        "SUM(current_people) AS participants FROM f4t_rooms " +
        "WHERE snapshot_id = ? GROUP BY owner_id " +
        "ORDER BY rooms DESC, participants DESC LIMIT ?",
    )
    .bind(latest.id, limit)
    .all<OwnerStatDbRow>();

  return results.map((row) => ({
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    rooms: row.rooms,
    participants: row.participants,
  }));
}

/** Most-followed users in the latest snapshot's participants. */
export async function topUsersLatest(
  db: D1Database,
  limit: number,
): Promise<UserStat[]> {
  const latest = await db
    .prepare("SELECT id FROM f4t_snapshots " + LATEST_ORDER + " LIMIT 1")
    .first<{ id: number }>();
  if (!latest) return [];

  const { results } = await db
    .prepare(
      "SELECT user_id, MAX(name) AS name, " +
        "COALESCE(MAX(followers), 0) AS followers, " +
        "COALESCE(MAX(friends), 0) AS friends, " +
        "COUNT(DISTINCT room_id) AS rooms FROM f4t_participants " +
        "WHERE snapshot_id = ? GROUP BY user_id " +
        "ORDER BY followers DESC, friends DESC LIMIT ?",
    )
    .bind(latest.id, limit)
    .all<UserStatDbRow>();

  return results.map((row) => ({
    userId: row.user_id,
    name: row.name,
    followers: row.followers,
    friends: row.friends,
    rooms: row.rooms,
  }));
}

/** Daily rollup rows for the last N distinct days, newest day first. */
export async function dailyStats(
  db: D1Database,
  days: number,
): Promise<DailyStat[]> {
  const { results } = await db
    .prepare(
      "SELECT day, language, avg_rooms, peak_rooms, peak_participants, " +
        "peak_hour, unique_owners FROM f4t_daily_stats " +
        "WHERE day IN (SELECT DISTINCT day FROM f4t_daily_stats " +
        "ORDER BY day DESC LIMIT ?) ORDER BY day DESC, language",
    )
    .bind(days)
    .all<DailyStatDbRow>();

  return results.map((row) => ({
    day: row.day,
    language: row.language,
    avgRooms: row.avg_rooms,
    peakRooms: row.peak_rooms,
    peakParticipants: row.peak_participants,
    peakHour: row.peak_hour,
    uniqueOwners: row.unique_owners,
  }));
}

/**
 * Roll the raw snapshots of one UTC day into per-language daily stats, then
 * delete those snapshots (cascading to rooms/participants). Upserts and the
 * delete are submitted in a single batch, with upserts first, so the rollup
 * always happens before the data is removed. `day` is bound, never inlined.
 */
export async function rollupAndPrune(
  db: D1Database,
  day: string,
): Promise<void> {
  const { results } = await db
    .prepare(
      "WITH per_snapshot AS (" +
        "SELECT s.id AS snapshot_id, s.scraped_at AS scraped_at, " +
        "r.language AS language, COUNT(*) AS room_count, " +
        "SUM(r.current_people) AS participant_count " +
        "FROM f4t_rooms AS r JOIN f4t_snapshots AS s ON s.id = r.snapshot_id " +
        "WHERE date(s.scraped_at) = ? GROUP BY s.id, r.language" +
        ")," +
        "ranked AS (" +
        "SELECT language, room_count, participant_count, " +
        "CAST(strftime('%H', scraped_at) AS INTEGER) AS hour, " +
        "ROW_NUMBER() OVER (PARTITION BY language " +
        "ORDER BY participant_count DESC, snapshot_id ASC) AS rn " +
        "FROM per_snapshot" +
        ")," +
        "agg AS (" +
        "SELECT language, ROUND(AVG(room_count)) AS avg_rooms, " +
        "MAX(room_count) AS peak_rooms, MAX(participant_count) AS peak_participants " +
        "FROM per_snapshot GROUP BY language" +
        ")," +
        "owners AS (" +
        "SELECT r.language AS language, COUNT(DISTINCT r.owner_id) AS unique_owners " +
        "FROM f4t_rooms AS r JOIN f4t_snapshots AS s ON s.id = r.snapshot_id " +
        "WHERE date(s.scraped_at) = ? GROUP BY r.language" +
        ")" +
        "SELECT a.language AS language, a.avg_rooms AS avg_rooms, " +
        "a.peak_rooms AS peak_rooms, a.peak_participants AS peak_participants, " +
        "p.hour AS peak_hour, o.unique_owners AS unique_owners " +
        "FROM agg AS a " +
        "JOIN ranked AS p ON p.language = a.language AND p.rn = 1 " +
        "JOIN owners AS o ON o.language = a.language",
    )
    .bind(day, day)
    .all<RollupDbRow>();

  const statements: D1PreparedStatement[] = results.map((row) =>
    db
      .prepare(
        "INSERT INTO f4t_daily_stats " +
          "(day, language, avg_rooms, peak_rooms, peak_participants, peak_hour, unique_owners) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(day, language) DO UPDATE SET " +
          "avg_rooms = excluded.avg_rooms, " +
          "peak_rooms = excluded.peak_rooms, " +
          "peak_participants = excluded.peak_participants, " +
          "peak_hour = excluded.peak_hour, " +
          "unique_owners = excluded.unique_owners",
      )
      .bind(
        day,
        row.language,
        row.avg_rooms,
        row.peak_rooms,
        row.peak_participants,
        row.peak_hour,
        row.unique_owners,
      ),
  );

  // Always prune the day, even when there were no languages to roll up.
  statements.push(
    db.prepare("DELETE FROM f4t_snapshots WHERE date(scraped_at) = ?").bind(day),
  );

  await db.batch(statements);
}
