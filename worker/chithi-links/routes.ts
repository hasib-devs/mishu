import { Hono } from "hono";
import { cors } from "hono/cors";

import { listTargets } from "./db.ts";

export const chithiLinksApp = new Hono<{ Bindings: Env }>();

chithiLinksApp.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  }),
);

function clampLimit(raw: string | null, def: number): number {
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

chithiLinksApp.get("/api/chithi-links", async (c) => {
  const limit = clampLimit(c.req.query("limit") ?? null, 100);
  return c.json(await listTargets(c.env.DB, limit));
});

chithiLinksApp.notFound((c) => c.json({ error: "Not found" }, 404));

chithiLinksApp.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
