import { drizzle } from "drizzle-orm/d1";

import { chithis } from "./schema.ts";

export function dbFor(d1: D1Database) {
  return drizzle(d1, { schema: { chithis } });
}

export type ChithiDb = ReturnType<typeof dbFor>;
