/**
 * Find chithi.me profile links in free4talk room topics and user bios.
 *
 * Hosts must be exactly `chithi.me` (optionally `www.` and a URL scheme), so
 * lookalikes like `notchithi.me` or `chithi.me.evil.com` are ignored.
 */
const CHITHI_LINK =
  /(?<![A-Za-z0-9-])(?:https?:\/\/)?(?:www\.)?chithi\.me\/([A-Za-z0-9_.]{1,30})/gi;

export function extractChithiUsernames(
  text: string | null | undefined,
): string[] {
  if (!text) return [];

  const usernames: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(CHITHI_LINK)) {
    const username = match[1].replace(/[._]+$/, "");
    if (!username) continue;
    const key = username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    usernames.push(username);
  }
  return usernames;
}
