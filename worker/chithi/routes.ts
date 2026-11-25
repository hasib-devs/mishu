import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { dbFor } from "./db.ts";
import {
  createChithi,
  deleteChithi,
  getChithi,
  listChithis,
  updateChithi,
} from "./service.ts";
import {
  createChithiSchema,
  listQuerySchema,
  patchChithiSchema,
} from "./validation.ts";

export const chithiApp = new Hono<{ Bindings: Env }>();

chithiApp.use("*", async (c, next) => {
  const method = c.req.method;
  if ((method === "POST" || method === "PATCH") && c.req.path.startsWith("/api/chithis")) {
    try {
      await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }
  }
  await next();
});

chithiApp.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  }),
);

chithiApp.get(
  "/api/chithis",
  zValidator("query", listQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const { limit } = c.req.valid("query");
    return c.json(await listChithis(dbFor(c.env.DB), limit));
  },
);

chithiApp.post(
  "/api/chithis",
  zValidator("json", createChithiSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const { content } = c.req.valid("json");
    return c.json(await createChithi(dbFor(c.env.DB), { content }), 201);
  },
);

chithiApp.get("/api/chithis/:id", async (c) => {
  const row = await getChithi(dbFor(c.env.DB), c.req.param("id"));
  if (!row) return c.json({ error: "Chithi not found" }, 404);
  return c.json(row);
});

chithiApp.patch(
  "/api/chithis/:id",
  zValidator("json", patchChithiSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const { content } = c.req.valid("json");
    const row = await updateChithi(dbFor(c.env.DB), c.req.param("id"), { content });
    if (!row) return c.json({ error: "Chithi not found" }, 404);
    return c.json(row);
  },
);

chithiApp.delete("/api/chithis/:id", async (c) => {
  const removed = await deleteChithi(dbFor(c.env.DB), c.req.param("id"));
  if (!removed) return c.json({ error: "Chithi not found" }, 404);
  return c.json({ success: true });
});

chithiApp.notFound((c) => c.json({ error: "Not found" }, 404));

chithiApp.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
