import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  getLatest,
  listSnapshots,
  listRoomsLatest,
  topOwnersLatest,
  topUsersLatest,
  dailyStats,
} from "./db.ts";

export const free4talkApp = new Hono<{ Bindings: Env }>();

free4talkApp.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  }),
);

function clampLimit(raw: string | null, def: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function clampDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, Math.floor(n)));
}

free4talkApp.get("/api/free4talk/latest", async (c) => {
  return c.json(await getLatest(c.env.DB));
});

free4talkApp.get("/api/free4talk/snapshots", async (c) => {
  const limit = clampLimit(c.req.query("limit") ?? null, 24);
  return c.json(await listSnapshots(c.env.DB, limit));
});

free4talkApp.get("/api/free4talk/languages", async (c) => {
  const days = clampDays(c.req.query("days") ?? null);
  return c.json(await dailyStats(c.env.DB, days));
});

free4talkApp.get("/api/free4talk/top-owners", async (c) => {
  const limit = clampLimit(c.req.query("limit") ?? null, 20);
  return c.json(await topOwnersLatest(c.env.DB, limit));
});

free4talkApp.get("/api/free4talk/top-users", async (c) => {
  const limit = clampLimit(c.req.query("limit") ?? null, 20);
  return c.json(await topUsersLatest(c.env.DB, limit));
});

free4talkApp.get("/api/free4talk/rooms", async (c) => {
  const rawLanguage = c.req.query("language");
  const rawLevel = c.req.query("level");
  const rawQ = c.req.query("q");
  const filters = {
    language: rawLanguage && rawLanguage !== "" ? rawLanguage : undefined,
    level: rawLevel && rawLevel !== "" ? rawLevel : undefined,
    q: rawQ && rawQ !== "" ? rawQ : undefined,
  };
  return c.json(await listRoomsLatest(c.env.DB, filters));
});

free4talkApp.notFound((c) => c.json({ error: "Not found" }, 404));

free4talkApp.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});