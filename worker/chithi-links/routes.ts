import { Hono } from "hono";
import { cors } from "hono/cors";

import { runHourlyJobs, type HourlyRunResult } from "../hourly.ts";
import { listTargets } from "./db.ts";

export type HourlyRunner = (env: Env) => Promise<HourlyRunResult>;

// Per-isolate guard: a second click while a run is in flight is rejected.
let manualRunInFlight = false;

export function createChithiLinksApp(runJob: HourlyRunner = runHourlyJobs) {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Run-Token"],
    }),
  );

  function clampLimit(raw: string | null, def: number): number {
    if (!raw) return def;
    const n = Number(raw);
    if (!Number.isFinite(n)) return def;
    return Math.min(100, Math.max(1, Math.floor(n)));
  }

  app.get("/api/chithi-links", async (c) => {
    const limit = clampLimit(c.req.query("limit") ?? null, 100);
    return c.json(await listTargets(c.env.DB, limit));
  });

  app.post("/api/chithi-links/run", async (c) => {
    const expected = (c.env as Env & { MANUAL_RUN_TOKEN?: string }).MANUAL_RUN_TOKEN;
    if (!expected) return c.json({ error: "manual trigger is not configured" }, 503);
    if (c.req.header("X-Run-Token") !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (manualRunInFlight) {
      return c.json({ error: "run already in progress" }, 409);
    }
    manualRunInFlight = true;
    try {
      return c.json(await runJob(c.env));
    } finally {
      manualRunInFlight = false;
    }
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export const chithiLinksApp = createChithiLinksApp();
