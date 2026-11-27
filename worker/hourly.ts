/**
 * The hourly job, shared by the cron trigger and the manual "Run now" button.
 * Steps are injectable so tests can exercise the orchestration without a
 * browser, an AI key or D1.
 */
import { dbFor } from "./chithi/db.ts";
import { generateHourlyChithi } from "./chithi/generate.ts";
import type { PipelineResult } from "./chithi-links/pipeline.ts";
import { runChithiLinkPipeline } from "./chithi-links/pipeline.ts";

export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ScrapeSummary {
  snapshotId: number;
  totalRooms: number;
  totalParticipants: number;
}

export interface HourlyRunResult {
  chithi: StepResult<string | null>;
  scrape: StepResult<ScrapeSummary>;
  links: StepResult<PipelineResult>;
}

export interface HourlyDeps {
  chithi?: (env: Env) => Promise<string | null>;
  scrape?: (env: Env) => Promise<ScrapeSummary>;
  links?: (env: Env) => Promise<PipelineResult>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function attempt<T>(fn: () => Promise<T>): Promise<StepResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runHourlyJobs(
  env: Env,
  deps: HourlyDeps = {},
): Promise<HourlyRunResult> {
  const generate =
    deps.chithi ??
    (async (e: Env) => {
      const row = await generateHourlyChithi(
        dbFor(e.DB),
        e as unknown as Record<string, unknown>,
      );
      return row?.id ?? null;
    });
  const scrape =
    deps.scrape ??
    (async (e: Env) => {
      const { scrapeFree4Talk } = await import("./free4talk/scrape.ts");
      return scrapeFree4Talk(e);
    });
  const links = deps.links ?? ((e: Env) => runChithiLinkPipeline(e, e.DB));

  const chithi = await attempt(() => generate(env));
  const scraped = await attempt(() => scrape(env));
  const linked: StepResult<PipelineResult> = scraped.ok
    ? await attempt(() => links(env))
    : { ok: false, error: "scrape failed" };

  return { chithi, scrape: scraped, links: linked };
}
