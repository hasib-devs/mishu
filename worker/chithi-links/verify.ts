/** Public profile shape returned by `GET /api/profile/<username>`. */
export interface ChithiProfile {
  id: string;
  username: string;
  paused: boolean;
}

/**
 * Verify a chithi.me account. Returns `null` for missing, paused or malformed
 * profiles, and for any network/parse failure — those are not valid targets.
 */
export async function verifyChithiProfile(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChithiProfile | null> {
  const url = `https://chithi.me/api/profile/${encodeURIComponent(username)}`;

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    const id = data.id;
    const name = data.username;
    if (typeof id !== "string" || id.length === 0 || typeof name !== "string") {
      return null;
    }
    if (name.toLowerCase() !== username.toLowerCase()) return null;

    const paused = data.paused === true;
    if (paused) return null;

    return { id, username: name, paused: false };
  } catch {
    return null;
  }
}
