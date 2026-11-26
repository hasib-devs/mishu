/**
 * Send letters through the real chithi.me form in a browser. The site's API
 * expects browser-derived fingerprint/WURFL signals, so driving the page is
 * more durable than calling the endpoint directly.
 *
 * Structural page types keep this module loadable by `node --test`; the actual
 * Playwright import happens lazily inside `defaultLaunch`.
 */

export interface PageLike {
  goto(
    url: string,
    options?: { waitUntil?: "domcontentloaded" | "networkidle"; timeout?: number },
  ): Promise<unknown>;
  locator(selector: string): { fill(value: string): Promise<void> };
  getByRole(
    role: string,
    options: { name: string },
  ): { click(): Promise<void> };
  waitForURL(pattern: string, options?: { timeout?: number }): Promise<unknown>;
}

export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export type Launch = (
  binding: unknown,
  options: { keep_alive: number },
) => Promise<BrowserLike>;

export interface SendResult {
  username: string;
  ok: boolean;
  error?: string;
}

async function defaultLaunch(
  binding: unknown,
  options: { keep_alive: number },
): Promise<BrowserLike> {
  const { launch } = await import("@cloudflare/playwright");
  return (await launch(binding as never, options)) as unknown as BrowserLike;
}

/** Send one letter per item using a single browser, isolating per-user errors. */
export async function sendLetters(
  env: Env,
  items: { username: string; content: string }[],
  launchImpl: Launch = defaultLaunch,
): Promise<SendResult[]> {
  if (items.length === 0) return [];

  const browser = await launchImpl(env.MYBROWSER, { keep_alive: 120_000 });
  const results: SendResult[] = [];

  try {
    for (const item of items) {
      const page = await browser.newPage();
      try {
        await page.goto(
          `https://chithi.me/${encodeURIComponent(item.username)}`,
          { waitUntil: "domcontentloaded", timeout: 30_000 },
        );
        await page
          .locator('textarea[aria-label="Write your anonymous letter"]')
          .fill(item.content);
        await page.getByRole("button", { name: "Send letter" }).click();
        await page.waitForURL("**/letter-sent", { timeout: 20_000 });
        results.push({ username: item.username, ok: true });
      } catch (err) {
        results.push({
          username: item.username,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
