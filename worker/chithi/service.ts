import { desc, eq } from "drizzle-orm";

import type { ChithiDb } from "./db.ts";
import { chithis, type ChithiRow } from "./schema.ts";
import { createChithiSchema, patchChithiSchema } from "./validation.ts";

export class SlotTakenError extends Error {
  constructor() {
    super("Chithi slot is already taken");
    this.name = "SlotTakenError";
  }
}

export type CreateChithiInput = {
  content: string;
  source?: "manual" | "ai";
  generatedFor?: number | null;
  paperStyle?: string;
};

export type PatchChithiInput = { content?: string; paperStyle?: string };

export function listChithis(db: ChithiDb, limit: number): Promise<ChithiRow[]> {
  return db.select().from(chithis).orderBy(desc(chithis.created_at)).limit(limit);
}

export async function getChithi(db: ChithiDb, id: string): Promise<ChithiRow | null> {
  const rows = await db.select().from(chithis).where(eq(chithis.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createChithi(db: ChithiDb, input: CreateChithiInput): Promise<ChithiRow> {
  const { content } = createChithiSchema.parse({ content: input.content });
  const generatedFor = input.generatedFor ?? null;
  if (generatedFor !== null && (!Number.isInteger(generatedFor) || generatedFor % 3_600_000 !== 0)) {
    throw new Error("generatedFor must be an hour-aligned epoch in milliseconds");
  }
  if (generatedFor !== null) {
    const taken = await db.select().from(chithis)
      .where(eq(chithis.generated_for, generatedFor)).limit(1);
    if (taken.length > 0) throw new SlotTakenError();
  }

  const id = crypto.randomUUID();
  const existing = await db.select({ created_at: chithis.created_at }).from(chithis);
  const lastCreatedAt = existing.reduce((max, row) => Math.max(max, row.created_at), 0);
  const now = Math.max(Date.now(), lastCreatedAt + 1);
  await db.insert(chithis).values({
    id,
    content,
    source: input.source ?? "manual",
    generated_for: generatedFor,
    paper_style: input.paperStyle ?? "classic",
    created_at: now,
    updated_at: now,
  });
  return (await getChithi(db, id))!;
}

export async function updateChithi(
  db: ChithiDb,
  id: string,
  patch: PatchChithiInput,
): Promise<ChithiRow | null> {
  const { content, paper_style } = patchChithiSchema.parse({
    content: patch.content,
    paper_style: patch.paperStyle,
  });
  const current = await getChithi(db, id);
  if (!current) return null;
  const values: { content?: string; paper_style?: string; updated_at: number } = {
    updated_at: Math.max(Date.now(), current.updated_at + 1),
  };
  if (content !== undefined) values.content = content;
  if (paper_style !== undefined) values.paper_style = paper_style;
  await db.update(chithis).set(values).where(eq(chithis.id, id));
  return getChithi(db, id);
}

export async function deleteChithi(db: ChithiDb, id: string): Promise<boolean> {
  if (!await getChithi(db, id)) return false;
  await db.delete(chithis).where(eq(chithis.id, id));
  return true;
}
